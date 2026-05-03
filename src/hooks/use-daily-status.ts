import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DailyStatus = {
  projected_balance: number;
  available_today: number;
  budget_today: number;
  burnout_date: string;
  score: number;
  income_total: number;
  income_extra: number;
  spent_month: number;
  savings_month: number;
  saved_month: number;
  savings_pending: number;
  fixed_total: number;
  fixed_paid: number;
  fixed_pending: number;
  patrimony: number;
  patrimony_goals: number;
  days_remaining: number;
};

export const dailyStatusKey = ["daily-status"] as const;

export function useDailyStatus(enabled = true) {
  return useQuery({
    queryKey: dailyStatusKey,
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<DailyStatus> => {
      const { data, error } = await supabase.rpc("get_daily_status");
      if (error) throw error;
      return data as unknown as DailyStatus;
    },
  });
}

/** Invalida todo lo que depende del estado financiero. Llamar tras cualquier mutación. */
export function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: dailyStatusKey });
    qc.invalidateQueries({ queryKey: ["recurring-items"] });
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
}
