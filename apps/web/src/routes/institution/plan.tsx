import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InstitutionFoundations } from '@/features/foundations/institution-foundations';
import { InstitutionPlan } from '@/features/planning/institution-plan';

const route = getRouteApi('/authed/institution/plan');

/**
 * The yearly setup in one place: the plan with its quarterly baselines, and the foundation
 * documents. The tab is in the URL so notifications can link straight to it.
 */
export function PlanPage() {
  const { tab = 'plan' } = route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Plan & documents"
        title="Your plan and foundation documents"
        description="What each quarter is measured against, and the documents scored once for the year."
      />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          void navigate({
            to: '/institution/plan',
            search: { tab: next === 'documents' ? 'documents' : undefined },
            replace: true,
          })
        }
        className="grid grid-cols-1 gap-4"
      >
        <TabsList className="w-fit">
          <TabsTrigger value="plan">Plan and baselines</TabsTrigger>
          <TabsTrigger value="documents">Foundation documents</TabsTrigger>
        </TabsList>
        <TabsContent value="plan">
          <InstitutionPlan />
        </TabsContent>
        <TabsContent value="documents">
          <InstitutionFoundations />
        </TabsContent>
      </Tabs>
    </div>
  );
}
