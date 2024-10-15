import { createClient } from "@/utils/supabase/server";

export default async function Notes() {
  const supabase = createClient();
  const { data: emails } = await supabase.from("emails").select();

  return <pre>{JSON.stringify(emails, null, 2)}</pre>;
}
