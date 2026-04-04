export type SystemHealthViewModel = {
  serviceName: string;
  statusLabel: "ok" | "degraded";
  message: string;
  checkedAtLabel: string;
  detailLabel: string;
};
