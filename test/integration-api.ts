/**
 * Infrastructure de test d'intégration — serveur API partagé (singleton).
 *
 * Usage :
 *   import { getTestServer, releaseTestServer } from "../test-support/server.ts";
 *   
 *   beforeAll(async () => {
 *     const server = await getTestServer();
 *     // server.baseUrl, server.stop()
 *   });
 *   
 *   afterAll(async () => {
 *     await releaseTestServer();
 *   });
 */

export { getTestServer, releaseTestServer } from "./support/server";
