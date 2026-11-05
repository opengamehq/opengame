// The public subset of @opengame/shared: the modules the CLI and SDK are built from.
export * from "./limits-browser";
export * from "./contact";
export * from "./media";
export * from "./studio-progress";
export * from "./genres";
export * from "./game-kinds";
export * from "./genre-games";
export * from "./text-policy";
export * from "./submission-maintenance";
export { parseInventory, validInventoryChunks, validInventoryPointer } from "./serving-inventory";
export type { InventoryChunk, InventoryFile, ServingInventory, ServingInventoryPointer } from "./serving-inventory";
export { ANALYTICS_KINDS, ANALYTICS_WINDOW_KINDS, REMOVED_ANALYTICS_FILTERS, analyticsExtensionRows } from "./analytics";
export type {
  AnalyticsKind, AnalyticsEvent, AnalyticsQuery, AnalyticsSummary,
  AnalyticsBreakdown, AnalyticsDaily, AnalyticsCustomEvent, AnalyticsSignalCoverage,
  AnalyticsEngagementSignal, AnalyticsSignals, AnalyticsBenchmark, AnalyticsInsights,
  AnalyticsReport, AnalyticsWindowKind, AnalyticsWindow, AnalyticsReportWindow,
} from "./analytics";
export { canonicalSocialLink, splitSocialLinkText, type SocialLinkPart } from "./social-links";
