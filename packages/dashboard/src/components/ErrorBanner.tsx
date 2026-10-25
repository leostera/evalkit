import { Banner } from '@cloudflare/kumo';

export function ErrorBanner({
  message,
  title,
}: {
  message: string;
  title?: string;
}) {
  return (
    <Banner
      variant="error"
      size="sm"
      role="alert"
      title={title}
      description={message}
    />
  );
}
