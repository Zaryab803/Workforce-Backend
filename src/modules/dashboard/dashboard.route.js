import { Router } from "express";
import { dashboardService } from "./dashboard.service.js";
import { dashboardController } from "./dashboard.controller.js";
export function dashboardRoutes(db) {
  const r = Router(),
    c = dashboardController(dashboardService(db));
  r.get("/", c.get);
  return r;
}
