import { Input } from '@cloudflare/kumo';

/** Table search with the visible/total count beside it. */
export function SearchField({
  label,
  placeholder,
  value,
  count,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  count: string;
  onChange(value: string): void;
}) {
  return (
    <div className="search-field flex min-w-0 flex-wrap items-center gap-3">
      <Input
        type="search"
        size="sm"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        className="w-full sm:w-80"
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="search-count text-xs text-kumo-subtle tabular-nums">
        {count}
      </span>
    </div>
  );
}
