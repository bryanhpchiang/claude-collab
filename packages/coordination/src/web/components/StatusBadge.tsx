type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`dash-status dash-status-${status}`}>
      <span className="dash-status-dot"></span>
      {status}
    </span>
  );
}
