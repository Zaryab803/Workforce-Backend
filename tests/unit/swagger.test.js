import { test, expect } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { openapi } from "../../src/docs/openapi.js";

const app = createApp({ db: {}, redis: null });

test("GET /api/docs serves Swagger UI HTML", async () => {
  const res = await request(app).get("/api/docs/");
  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toContain("text/html");
  expect(res.text).toContain("swagger-ui");
});

test("GET /api/docs (without slash) redirects to /api/docs/", async () => {
  const res = await request(app).get("/api/docs");
  expect([301, 302]).toContain(res.status);
});

test("GET / redirects to /api/docs", async () => {
  const res = await request(app).get("/");
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe("/api/docs");
});

test("GET /api/openapi.json returns valid OpenAPI 3.0 specification", async () => {
  const res = await request(app).get("/api/openapi.json");
  expect(res.status).toBe(200);
  expect(res.body.openapi).toBe("3.0.3");
  expect(res.body.info.title).toBe(openapi.info.title);
  expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
});
