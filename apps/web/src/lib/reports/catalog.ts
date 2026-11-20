import { REPORT_DEFINITION_VERSION, reportCatalogResponseSchema, type ReportCatalogResponse } from "@polivo/contracts";
import { REPORT_DEFINITIONS } from "@polivo/domain";

export function loadReportCatalog(): ReportCatalogResponse {
  return reportCatalogResponseSchema.parse({
    definitionVersion: REPORT_DEFINITION_VERSION,
    items: REPORT_DEFINITIONS.map((definition) => ({
      reportType: definition.reportType,
      title: definition.title,
      description: definition.description,
      dateModel: definition.dateModel,
      supportedFilters: [...definition.supportedFilters],
      supportedGroupings: [...definition.supportedGroupings],
      available: definition.available,
      unavailableReason: definition.unavailableReason,
    })),
  });
}