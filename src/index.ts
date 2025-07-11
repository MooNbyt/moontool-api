/// <reference path="./types/env.d.ts" />
import "dotenv-safe/config";
import "reflect-metadata";

import * as trpcExpress from "@trpc/server/adapters/express";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authExpressMiddleware } from "./controller/auth-flows";
import { setupRateLimitReplenishCron } from "./controller/license-rate-limit";
import { appRouter } from "./routers/_app";
import { RegisterRoutes } from "./tsoa-generated/routes";
import { ShowError } from "./utils/ShowError";
import { tsoaErrorHandler } from "./utils/tsoa-response-error";

const app = express();

// ✅ CORS for /trpc requests
app.use(
  "/trpc",
  cors({
    origin: process.env.CORS_ORIGIN.split(","),
    credentials: true,
  })
);

// ✅ General CORS for other routes (not /trpc)
const allCors = cors({
  origin: process.env.CORS_ORIGIN.split(","),
  credentials: true,
});

const urlencoded = express.urlencoded({ extended: true });
const json = express.json();

app.use((req, res, next) => {
  if (req.url.startsWith("/trpc")) return next();
  allCors(req, res, () => {
    urlencoded(req, res, () => {
      json(req, res, next);
    });
  });
});

// ✅ Parse cookies from requests
app.use(cookieParser());

// ✅ Attach userId to req from accessToken or refreshToken
app.use(authExpressMiddleware);

// ✅ tRPC middleware
app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => {
      return { userId: req.userId, res };
    },
    onError(data) {
      if (
        data.error.message?.startsWith("error.") ||
        data.error.message?.startsWith("+ ")
      )
        return;

      console.error(data.error);
      data.error.message = ShowError.internalServerError().message;
    },
  })
);

// ✅ Background cron
setupRateLimitReplenishCron();

// ✅ OpenAPI routes
RegisterRoutes(app);

// ✅ Error handler
app.use(tsoaErrorHandler);

// ✅ Start the server
app.listen(process.env.PORT, () => {
  console.log(`\n📄 Server ready on port ${process.env.PORT}\n`);
});
