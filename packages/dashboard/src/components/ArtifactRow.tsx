export function ArtifactRow({
  artifact,
}: {
  artifact: { path: string; kind: string; size?: number };
}) {
  return (
    <tr>
      <td className="mono">{artifact.path}</td>
      <td>{artifact.kind}</td>
      <td>{artifact.size === undefined ? '—' : `${artifact.size} bytes`}</td>
    </tr>
  );
}
