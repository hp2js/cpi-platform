import type { Session } from '@cpi/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, LogOut, UserCog, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { roleLabel, signOut } from '@/features/session/queries';
import { cn } from '@/lib/utils';

export function AccountMenu({
  session,
  tone = 'light',
}: {
  session: Session;
  tone?: 'light' | 'dark';
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const { user } = session;
  async function handleSignOut() {
    setPending(true);
    try {
      await signOut(queryClient);
    } finally {
      await navigate({ to: '/sign-in', search: { redirect: undefined } });
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild data-print-hide>
        <Button
          variant="ghost"
          className={cn(
            'h-auto max-w-56 gap-2 px-2 py-1.5 text-left',
            tone === 'dark' &&
              'text-primary-foreground hover:bg-white/10 hover:text-primary-foreground',
          )}
        >
          <UserRound className="size-5 shrink-0 sm:hidden" aria-hidden="true" />
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-medium">
              {user.displayName}
            </span>
            <span
              className={cn(
                'block truncate text-xs',
                tone === 'dark'
                  ? 'text-primary-foreground/75'
                  : 'text-muted-foreground',
              )}
            >
              {roleLabel[user.role]}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only sm:hidden">
            Account menu for {user.displayName}
          </span>
          <span className="sr-only max-sm:hidden">Account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{user.displayName}</span>
          <span className="block text-xs text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            void navigate({
              to: {
                institution: '/institution/account',
                officer: '/officer/account',
                supervisor: '/supervisor/account',
                administrator: '/admin/account',
              }[user.role],
            })
          }
        >
          <UserCog aria-hidden="true" />
          My account
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => void handleSignOut()}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
