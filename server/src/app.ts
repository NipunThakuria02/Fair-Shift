import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { ZodError } from "zod";
import { firebase } from "./firebase.js";
import { FairShiftService } from "./service.js";
import {
  ApiError,
  emptySchema,
  checkoutSchema,
  reportSchema,
  transitionSchema,
  requireRole,
  type Context,
} from "./domain.js";
type Dependencies = ReturnType<typeof firebase>;
type Handler = (req: Request, res: Response) => Promise<unknown>;
const route =
  (handler: Handler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
export function createApp(dependencies?: Dependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: [
            "'self'",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://*.firebaseapp.com",
            ...(process.env.NODE_ENV === "production"
              ? []
              : ["http://127.0.0.1:9099", "http://localhost:9099"]),
          ],
          frameSrc: ["'self'", "https://*.firebaseapp.com"],
          imgSrc: ["'self'", "data:"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res
          .status(429)
          .json({
            error: {
              code: "RATE_LIMITED",
              message: "Too many requests. Please try again shortly.",
            },
          }),
    }),
  );
  const deps = () => dependencies || firebase();
  app.use("/api", (req, res, next) => {
    void (async () => {
      const authorization = req.get("Authorization");
      if (!authorization?.startsWith("Bearer ") || authorization.length > 8192)
        throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
      const { auth, db } = deps();
      let uid: string;
      try {
        uid = (await auth.verifyIdToken(authorization.slice(7), true)).uid;
      } catch {
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "Your session expired. Sign in again.",
        );
      }
      res.locals.service = new FairShiftService(db);
      res.locals.context = await (
        res.locals.service as FairShiftService
      ).context(uid);
      next();
    })().catch(next);
  });
  const router = express.Router();
  const ctx = (res: Response) => res.locals.context as Context;
  const svc = (res: Response) => res.locals.service as FairShiftService;
  router.get(
    "/me",
    route(async (_req, res) => {
      const { user, org } = ctx(res);
      res.json({
        user: {
          uid: user.uid,
          role: user.role,
          displayName: user.displayName,
          employeeCode: user.employeeCode,
          department: user.department,
          language: user.language,
          hourlyRatePaise: user.hourlyRatePaise,
        },
        organization: org,
      });
    }),
  );
  router.post(
    "/shifts/check-in",
    route(async (req, res) => {
      requireRole(ctx(res), "WORKER");
      emptySchema.parse(req.body ?? {});
      res.status(201).json(await svc(res).checkIn(ctx(res)));
    }),
  );
  router.post(
    "/shifts/check-out",
    route(async (req, res) => {
      requireRole(ctx(res), "WORKER");
      const body = checkoutSchema.parse(req.body);
      res.json(await svc(res).checkOut(ctx(res), body.breakMinutes));
    }),
  );
  router.get(
    "/me/shifts",
    route(async (_req, res) => {
      requireRole(ctx(res), "WORKER");
      res.json(await svc(res).ownShifts(ctx(res)));
    }),
  );
  router.get(
    "/me/earnings",
    route(async (_req, res) => {
      requireRole(ctx(res), "WORKER");
      const result = await svc(res).ownShifts(ctx(res));
      const items = result.items.filter((s) => s.status === "COMPLETED");
      res.json({
        ...result,
        items,
        totalEstimatedPaise: items.reduce(
          (sum, s) => sum + s.estimatedGrossPaise,
          0,
        ),
      });
    }),
  );
  router.post(
    "/reports",
    route(async (req, res) => {
      requireRole(ctx(res), "WORKER");
      const body = reportSchema.parse(req.body);
      res.status(201).json(await svc(res).createReport(ctx(res), body));
    }),
  );
  router.get(
    "/me/reports",
    route(async (_req, res) => {
      requireRole(ctx(res), "WORKER");
      res.json(await svc(res).reports(ctx(res), true));
    }),
  );
  router.get(
    "/admin/overview",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).overview(ctx(res)));
    }),
  );
  router.get(
    "/admin/workers",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).workers(ctx(res)));
    }),
  );
  router.get(
    "/admin/shifts",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).adminShifts(ctx(res)));
    }),
  );
  router.get(
    "/admin/reports",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).reports(ctx(res), false));
    }),
  );
  router.patch(
    "/admin/reports/:id",
    route(async (req, res) => {
      requireRole(ctx(res), "ADMIN");
      const body = transitionSchema.parse(req.body);
      res.json(
        await svc(res).updateReport(ctx(res), String(req.params.id), body),
      );
    }),
  );
  app.use("/api", router);
  app.use("/api", (_req, res) => {
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API route not found." } });
  });
  app.use(express.static(path.resolve("client/dist")));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.resolve("client/dist/index.html"));
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res
        .status(err.status)
        .json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof ZodError) {
      res
        .status(422)
        .json({
          error: {
            code: "INVALID_INPUT",
            message: "Check the form fields and try again.",
          },
        });
      return;
    }
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? Number(err.status)
        : 500;
    if (status === 400 || status === 413) {
      res
        .status(status)
        .json({
          error: {
            code: "INVALID_REQUEST",
            message:
              status === 413
                ? "Request is too large."
                : "Request contains invalid JSON.",
          },
        });
      return;
    }
    console.error(
      JSON.stringify({
        event: "request_failed",
        code:
          typeof err === "object" && err !== null && "code" in err
            ? String(err.code)
            : "INTERNAL",
      }),
    );
    res
      .status(500)
      .json({
        error: {
          code: "INTERNAL",
          message: "The request could not be completed. Please try again.",
        },
      });
  });
  return app;
}
