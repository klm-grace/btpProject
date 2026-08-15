# storage — Bibliothèque de stockage hybride (Disque local ↔ Cloudflare R2)

## Rôle

Fournir une abstraction de stockage unifiée pour l'application.
L'app utilise une interface `StorageProvider` sans connaître le backend.
Migration automatique `disk → R2` quand le seuil (20 Go par défaut) est atteint.

## Architecture

```
┌─────────────────────────────────────┐
│         createStorage(config)       │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
    ┌────────┐   ┌────────┐
    │  Disk  │   │   R2   │
    └────┬───┘   └────┬───┘
         │            │
         └──────┬─────┘
                ▼
         ┌─────────────┐
         │  Provider   │
         │  Actif      │
         └─────────────┘
```

---

## API publique

```ts
import { createStorage } from "@libs/storage";

const storage = createStorage({ log }, {
  backend: "disk",
  diskPath: "/mnt/btp-uploads",
  diskMaxBytes: 20_000_000_000, // 20 Go
  r2Endpoint: "https://<id>.r2.cloudflarestorage.com",
  r2Bucket: "btp-media",
  r2AccessKeyId: "...",
  r2SecretAccessKey: "...",
});

// Upload
await storage.put("2026/08/14/uuid.jpg", imageBuffer);

// Téléchargement
const buffer = await storage.get("2026/08/14/uuid.jpg");

// Migration disk → R2 (déclenchée par cron)
await storage.migrateToR2(storage.r2);

// Vérifier si migration nécessaire
if (await storage.shouldMigrate()) {
  // Déclencher migration
}
```

---

## Configuration

| Clé | Type | Défaut | Rôle |
|-----|------|--------|------|
| `backend` | `"disk" \| "r2"` | `"disk"` | Backend initial |
| `diskPath` | `string` | `./data/uploads` | Dossier local |
| `diskMaxBytes` | `number` | `20_000_000_000` | Seuil migration (20 Go) |
| `r2Endpoint` | `string` | — | Endpoint R2 |
| `r2Bucket` | `string` | `"btp-media"` | Bucket |
| `r2AccessKeyId` | `string` | — | Access Key |
| `r2SecretAccessKey` | `string` | — | Secret Key |

---

## Backends

### Disk (local)

- Dossier configurable (`STORAGE_DISK_PATH`)
- Création automatique du dossier
- Taille mesurée via `fs.stat`
- Path traversal defense : clés sanitizées

### R2 (Cloudflare)

- `Bun.S3Client` natif
- Endpoint R2 : `https://<account_id>.r2.cloudflarestorage.com`
- Egress gratuit
- Compatible S3 API

---

## Migration Disk → R2

Déclenchée par un **cron admin** (endpoint `POST /api/admin/storage/migrate`) :

1. `storage.migrateToR2()` copie tous les fichiers du disque vers R2
2. `storage.switchBackend("r2")` bascule le backend actif
3. Suppression des fichiers locaux après succès

---

## Sécurité

- **Path traversal** : clés sanitizées (`../` supprimé)
- **Aucun fichier user** sans sanitization
- **Clés générées** : UUID + extension (pas le nom original)
- **Mutex migration** : flag `migrating` empêche uploads concurrents

---

## Exemple d'import dans un autre projet

```ts
import { createStorage } from "@libs/storage";
import type { StorageProvider } from "@libs/storage/types";

const storage = createStorage(
  { log: myLogger },
  { backend: "disk", diskPath: "/var/lib/myapp/uploads", diskMaxBytes: 10_000_000_000 }
);

const provider: StorageProvider = storage;

await provider.put("test.txt", new TextEncoder().encode("hello"));
```