/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as artifactRecords from "../artifactRecords.js";
import type * as artifacts from "../artifacts.js";
import type * as daytona from "../daytona.js";
import type * as daytonaClient from "../daytonaClient.js";
import type * as messages from "../messages.js";
import type * as runtimeSource from "../runtimeSource.js";
import type * as sessions from "../sessions.js";
import type * as streamEvents from "../streamEvents.js";
import type * as threadReads from "../threadReads.js";
import type * as threads from "../threads.js";
import type * as toolCalls from "../toolCalls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  artifactRecords: typeof artifactRecords;
  artifacts: typeof artifacts;
  daytona: typeof daytona;
  daytonaClient: typeof daytonaClient;
  messages: typeof messages;
  runtimeSource: typeof runtimeSource;
  sessions: typeof sessions;
  streamEvents: typeof streamEvents;
  threadReads: typeof threadReads;
  threads: typeof threads;
  toolCalls: typeof toolCalls;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
