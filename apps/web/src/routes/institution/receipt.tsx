import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { receiptQuery } from '@/features/reporting/queries';
import { ReceiptView } from '@/features/reporting/receipt-view';

const route = getRouteApi('/authed/institution/receipts/$receiptId');

export function ReceiptPage() {
  const { receiptId } = route.useParams();
  const receipt = useQuery(receiptQuery(receiptId));
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          receipt.data
            ? `${receipt.data.periodLabel} · revision ${receipt.data.revision}`
            : undefined
        }
        title="Submission receipt"
        description="Keep this for your records. It confirms what was received and when; it is not an evaluation."
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              Print
            </Button>
            <Link
              to="/institution/reports"
              className={buttonVariants({ variant: 'outline' })}
            >
              All reports
            </Link>
          </>
        }
      />
      <Alert className="print:hidden">
        <AlertDescription>
          This portal receipt is a prototype record, not an official EACC
          acknowledgement.
        </AlertDescription>
      </Alert>
      <QueryView query={receipt} label="receipt">
        {(data) => <ReceiptView receipt={data} />}
      </QueryView>
    </div>
  );
}
