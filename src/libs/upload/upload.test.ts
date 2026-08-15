import { describe, expect, it, beforeEach } from "bun:test";
import { createUpload, type UploadConfig } from "./upload.ts";
import { generateStorageKey, generateVariantKeys, MAGIC_BYTES } from "./types.ts";

/** Mock StorageProvider simple. */
function createMockStorage() {
  const data = new Map<string, Uint8Array>();
  const puts: Array<{ key: string; size: number }> = [];

  return {
    put: async (key: string, value: Uint8Array) => {
      data.set(key, value);
      puts.push({ key, size: value.byteLength });
    },
    get: async (key: string) => data.get(key) ?? null,
    del: async (key: string) => { data.delete(key); },
    exists: async (key: string) => data.has(key),
    size: async () => {
      let total = 0;
      for (const v of data.values()) total += v.byteLength;
      return total;
    },
    migrateToR2: async () => 0,
    switchBackend: () => {},
    activeBackend: () => "disk" as const,
    getDiskSize: async () => 0,
    shouldMigrate: async () => false,
    disk: {
      put: async () => {}, get: async () => null, del: async () => {},
      exists: async () => false, size: async () => 0,
      migrateToR2: async () => 0, switchBackend: () => {},
    },
    r2: {
      put: async () => {}, get: async () => null, del: async () => {},
      exists: async () => false, size: async () => 0,
      migrateToR2: async () => 0, switchBackend: () => {},
    },
    data, puts,
  } as unknown as import("@libs/storage").StorageProvider & {
    disk: import("@libs/storage").StorageProvider;
    r2: import("@libs/storage").StorageProvider;
    activeBackend: () => "disk" | "r2";
    getDiskSize: () => Promise<number>;
    shouldMigrate: () => Promise<boolean>;
  };
}

function makeConfig(overrides: Partial<UploadConfig> = {}): UploadConfig {
  return {
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxStorageBytes: 100 * 1024 * 1024, // 100 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    imageMaxWidth: 1920,
    imageMaxHeight: 1080,
    variantSizes: [150, 600],
    webpQuality: 80,
    ...overrides,
  };
}

function makeGifBuffer(): Uint8Array {
  return new Uint8Array([
    0x47,0x49,0x46,0x38,0x39,0x61,
    0x01,0x00,0x01,0x00,0x80,0x00,0x00,
    0x00,0x00,0x00,
    0x21,0xf9,0x04,0x01,0x00,0x00,0x01,0x00,
    0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,
    0x3b,
  ]);
}

describe("upload", () => {
  let upload: ReturnType<typeof createUpload>;
  let storage: ReturnType<typeof createMockStorage>;
  let config: UploadConfig;

  beforeEach(() => {
    config = makeConfig();
    storage = createMockStorage();
    upload = createUpload({ storage, log: { info: () => {} } }, config);
  });

  describe("validate", () => {
    it("rejette un buffer vide", async () => {
      const result = await upload.validate({ buffer: new Uint8Array(0), mime: "image/png", originalName: "test.png" });
      if (!result.ok) {
        expect(result.code).toBe("EMPTY_FILE");
      } else {
        throw new Error("Expected invalid result");
      }
    });

    it("rejette un buffer trop gros", async () => {
      const bigBuffer = new Uint8Array(config.maxFileSizeBytes + 1);
      const result = await upload.validate({ buffer: bigBuffer, mime: "image/gif", originalName: "test.gif" });
      if (!result.ok) expect(result.code).toBe("FILE_TOO_LARGE");
      else throw new Error("Expected invalid result");
    });

    it("rejette un garbage (pas de magic bytes)", async () => {
      const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE]);
      const result = await upload.validate({ buffer: garbage, mime: "image/png", originalName: "test.png" });
      if (!result.ok) expect(result.code).toBe("INVALID_MAGIC");
      else throw new Error("Expected invalid result");
    });

    it("rejette une extension qui ne correspond pas au MIME", async () => {
      // Buffer PNG valide mais nom .jpg
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const result = await upload.validate({ buffer: pngHeader, mime: "image/png", originalName: "test.jpg" });
      if (!result.ok) expect(result.code).toBe("EXTENSION_MISMATCH");
      else throw new Error("Expected invalid result");
    });
  });

  describe("generateStorageKey", () => {
    it("génère une clé avec arborescence YYYY/MM/DD", () => {
      const key = generateStorageKey("photo.jpg", "image/jpeg");
      expect(key).toMatch(/^\d{4}\/\d{2}\/\d{2}\//);
      expect(key).toContain("_photo.jpg");
    });

    it("sanitise les caractères spéciaux", () => {
      const key = generateStorageKey("my photo (1).jpg", "image/jpeg");
      expect(key).not.toContain(" ");
      expect(key).not.toContain("(");
      expect(key).not.toContain(")");
    });
  });

  describe("generateVariantKeys", () => {
    it("génère des clés pour chaque taille", () => {
      const keys = generateVariantKeys("2026/08/14/uuid_photo.jpg", [150, 600]);
      expect(keys).toHaveLength(2);
      expect(keys[0]!.key).toContain("_variant_150.webp");
      expect(keys[1]!.key).toContain("_variant_600.webp");
    });
  });

  describe("MAGIC_BYTES", () => {
    it("contient les signatures attendues", () => {
      expect(MAGIC_BYTES.PNG).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(MAGIC_BYTES.JPEG).toEqual([0xff, 0xd8, 0xff]);
      expect(MAGIC_BYTES.GIF).toEqual([0x47, 0x49, 0x46]);
      expect(MAGIC_BYTES.WEBP).toEqual([0x52, 0x49, 0x46, 0x46]);
    });
  });

  describe("sanitizeKey", () => {
    it("sanitize les caractères spéciaux sans jeter", () => {
      // sanitizeKey est maintenant exportée via generateStorageKey
      const key = generateStorageKey("../../etc/passwd.png", "image/png");
      // Les "/" sont remplacés par "_" dans generateStorageKey (chemin YYYY/MM/DD est ajouté par la fonction)
      // Vérifier que ".." est transformé en "_dot_"
      expect(key).toContain("_dot_");
      expect(key).toMatch(/^\d{4}\/\d{2}\/\d{2}\//);
    });

    it("génère une clé safe avec path traversal tenté", () => {
      const key = generateStorageKey("../../../root.png", "image/png");
      expect(key).toContain("_dot_");
      expect(key).toMatch(/^\d{4}\/\d{2}\/\d{2}\//);
    });
  });

  describe("upload — erreurs structurées", () => {
    it("upload() retourne une erreur structurée au lieu de jeter", async () => {
      const result = await upload.upload({ buffer: new Uint8Array(0), mime: "image/png", originalName: "empty.png" });
      // upload() retourne maintenant { ok: false, code, message } au lieu de jeter
      if ("ok" in result && !result.ok) {
        expect(result.code).toBe("EMPTY_FILE");
      } else {
        throw new Error("Expected validation error");
      }
    });

    it("upload() retourne STORAGE_FULL quand storage plein", async () => {
      // Utiliser un PNG valide (structure complète) pour passer la validation
      const pngBuf = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10,
        0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1,
        8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xDE,
        0, 0, 0, 9, 73, 68, 65, 84,
        0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x02,
        0x00, 0xE2, 0x21, 0xBC, 0x33,
        0, 0, 0, 0, 73, 69, 78, 68, 0xAE, 0x42, 0x60, 0x82,
      ]);
      const mockStorage = createMockStorage();
      const uploadFull = createUpload(
        { storage: mockStorage, log: { info: () => {} } },
        { ...makeConfig(), maxStorageBytes: 1 }, // 1 byte capacity
      );
      const result = await uploadFull.upload({ buffer: pngBuf, mime: "image/png", originalName: "test.png" });
      if ("ok" in result && !result.ok) {
        expect(result.code).toBe("STORAGE_FULL");
      } else {
        throw new Error("Expected STORAGE_FULL error");
      }
    });

    it("deleteByMediaId supprime les fichiers du storage", async () => {
      const key1 = "2026/08/15/uuid_test.png";
      const key2 = "2026/08/15/uuid_test_variant_150.webp";
      await storage.put(key1, new Uint8Array([1, 2, 3]));
      await storage.put(key2, new Uint8Array([4, 5, 6]));
      expect(await storage.exists(key1)).toBe(true);
      expect(await storage.exists(key2)).toBe(true);

      await upload.deleteByMediaId("test-media-id", [key1, key2]);

      expect(await storage.exists(key1)).toBe(false);
      expect(await storage.exists(key2)).toBe(false);
    });
  });
});