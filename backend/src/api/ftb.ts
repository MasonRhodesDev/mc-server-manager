import Elysia, { t } from "elysia";
import { getPackList, getPack, getPackVersions, getPackVersion, searchPacks } from "../services/ftb-client.js";

export const ftbRoutes = new Elysia({ prefix: "/api/ftb" })

  // GET /api/ftb/packs?search=&limit=20&offset=0
  .get("/packs", async ({ query }) => {
    const { search, limit = "20", offset = "0" } = query;
    if (search && search.length > 0) {
      return searchPacks(search, Number(limit), Number(offset));
    }
    return getPackList(Number(limit), Number(offset));
  }, {
    query: t.Object({
      search: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  // GET /api/ftb/packs/:packId
  .get("/packs/:packId", async ({ params, set }) => {
    try {
      const pack = await getPack(Number(params.packId));
      return { pack };
    } catch {
      set.status = 404;
      return { error: "Pack not found" };
    }
  })

  // GET /api/ftb/packs/:packId/versions
  .get("/packs/:packId/versions", async ({ params }) => {
    const versions = await getPackVersions(Number(params.packId));
    return { versions };
  })

  // GET /api/ftb/packs/:packId/versions/:versionId — full manifest with mod list
  .get("/packs/:packId/versions/:versionId", async ({ params, set }) => {
    try {
      const version = await getPackVersion(Number(params.packId), Number(params.versionId));
      if (!version) { set.status = 404; return { error: "Version not found" }; }
      return { version };
    } catch {
      set.status = 404;
      return { error: "Version not found" };
    }
  });
