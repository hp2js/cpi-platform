import {
  isChecklistAnswer,
  isEvidenceAnswer,
  isRowsAnswer,
  type AnswerValue as Value,
  type EvidenceItem,
  type Question,
} from '@cpi/contracts';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const scalar = (value: unknown, unit?: string) =>
  value === true
    ? 'Yes'
    : value === false
      ? 'No'
      : value === null || value === undefined || String(value).trim() === ''
        ? '—'
        : `${String(value)}${unit ? ` ${unit}` : ''}`;

/** A read-only answer of any question type, as officers and support staff see it. */
export function AnswerValue({
  question,
  value,
  evidence,
}: {
  question: Question;
  value: Value | undefined;
  evidence: EvidenceItem[];
}) {
  if (question.type === 'evidence') {
    const answer = isEvidenceAnswer(value) ? value : undefined;
    if (answer?.unavailable)
      return <>Declared not available: {answer.unavailable.explanation}</>;
    return (
      <>
        {evidence
          .filter((item) => answer?.evidenceIds.includes(item.id))
          .map((item) => item.fileName)
          .join(', ') || 'No file'}
      </>
    );
  }
  if (question.type === 'checklist') {
    const answer = isChecklistAnswer(value) ? value.items : {};
    return (
      <ul className="grid gap-0.5">
        {(question.items ?? []).map((item) => (
          <li key={item.id}>
            {item.label}:{' '}
            <span className="font-medium">
              {answer[item.id] === true
                ? 'Done'
                : answer[item.id] === false
                  ? 'Not done'
                  : 'Not answered'}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (question.type === 'repeated') {
    const rows = isRowsAnswer(value) ? value.rows : [];
    const columns = question.columns ?? [];
    if (!rows.length) return <>No rows</>;
    return (
      <div className="rounded-md border">
        <Table>
          <TableCaption className="sr-only">{question.label}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <span className="sr-only">Row</span>
              </TableHead>
              {columns.map((column) => (
                <TableHead key={column.id} scope="col">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableHead scope="row" className="text-muted-foreground">
                  {index + 1}
                </TableHead>
                {columns.map((column) => (
                  <TableCell key={column.id} className="whitespace-normal">
                    {scalar(row[column.id], column.limits?.unit)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  return <>{scalar(value, question.limits?.unit)}</>;
}
