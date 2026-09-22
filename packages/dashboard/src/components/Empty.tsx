export function Empty({ message }: { message: string }) {
  return (
    <div className="empty">
      <p>{message}</p>
    </div>
  );
}
