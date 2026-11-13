// The public subset of @opengame/shared: the modules the CLI and SDK are built from.
export * from "./limits";
export * from "./contact";
export * from "./studio-progress";
export * from "./genres";
export * from "./game-kinds";
export * from "./source-games";
export * from "./genre-games";
export * from "./text-policy";
export * from "./game-words";
export * from "./submission-maintenance";
export { parseInventory, validInventoryChunks, validInventoryPointer } from "./serving-inventory";
export type { InventoryChunk, InventoryFile, ServingInventory, ServingInventoryPointer } from "./serving-inventory";
export { ANALYTICS_KINDS, ANALYTICS_WINDOW_KINDS, PROFILE_VIEW_REFERRER_CLASSES, REMOVED_ANALYTICS_FILTERS, analyticsExtensionRows } from "./analytics";
export type {
  AnalyticsKind, AnalyticsEvent, AnalyticsQuery, AnalyticsSummary,
  AnalyticsBreakdown, AnalyticsDaily, AnalyticsCustomEvent, AnalyticsSignalCoverage,
  AnalyticsEngagementSignal, AnalyticsSignals, AnalyticsBenchmark, AnalyticsInsights,
  AnalyticsReport, AnalyticsWindowKind, AnalyticsWindow, AnalyticsReportWindow, ProfileViewEvent,
} from "./analytics";
export { canonicalSocialLink, splitSocialLinkText, type SocialLinkPart } from "./social-links";
export { hookAuthorised } from "./studio-hook-auth";
