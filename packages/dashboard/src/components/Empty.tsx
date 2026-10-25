import { Empty as KumoEmpty } from '@cloudflare/kumo';

export function Empty({
  message,
  description,
}: {
  message: string;
  description?: string;
}) {
  return (
    <KumoEmpty
      size="sm"
      title={message}
      description={description}
      className="py-12"
    />
  );
}
