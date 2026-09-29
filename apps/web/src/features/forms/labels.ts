import type { QuestionType } from '@cpi/contracts';

export const questionTypeLabels: Record<QuestionType, string> = {
  text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  yes_no: 'Yes / no',
  choice: 'Choice',
  evidence: 'Evidence upload',
  checklist: 'Checklist',
  repeated: 'Repeated rows',
  milestone_progress: 'Milestone progress (scored)',
};
