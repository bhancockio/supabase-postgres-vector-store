// app/api/store-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import OpenAI from "openai";

// Define the types for your email and sections
interface Email {
  subject: string;
  sender: string;
  recipient: string[];
  cc?: string[];
  bcc?: string[];
  body: string;
}

interface EmailSection {
  email_id: number;
  section_content: string;
  embedding: number[];
  section_order: number;
}

// Initialize Supabase Client
const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Define the schema for the Email object
const emailSchema = z.object({
  subject: z.string(),
  sender: z.string().email(),
  recipient: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  body: z.string(),
});

// Function to split the email body into chunks
function splitIntoChunks(text: string, chunkSize: number = 500): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const word of words) {
    if (currentChunk.length + word.length + 1 > chunkSize) {
      chunks.push(currentChunk);
      currentChunk = word;
    } else {
      currentChunk += (currentChunk ? " " : "") + word;
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

// POST handler
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const requestData = await request.json();

    // Validate the request data using zod
    const validationResult = emailSchema.safeParse(requestData);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid email data", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { subject, sender, recipient, cc, bcc, body }: Email =
      validationResult.data;

    // Step 1: Store the root email in the database
    const { data: email, error: emailError } = await supabase
      .from("emails")
      .insert([{ subject, sender, recipient, cc, bcc, body }])
      .select("id")
      .single();

    if (emailError) throw new Error(emailError.message);

    const emailId: number = email.id;

    // Step 2: Split the email body into smaller chunks
    const chunks = splitIntoChunks(body);

    // Step 3: Embed each chunk and store it in the database
    // Initialize OpenAI Client
    const openai = new OpenAI();
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
      });

      const embedding = embeddingResponse.data[0].embedding;

      const section: EmailSection = {
        email_id: emailId,
        section_content: chunk,
        embedding,
        section_order: i + 1,
      };

      const { error: sectionError } = await supabase
        .from("email_sections")
        .insert([section]);

      if (sectionError) throw new Error(sectionError.message);
    }

    return NextResponse.json(
      { message: "Email stored successfully!" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error storing email:", error);
    return NextResponse.json(
      { error: error.message || "Failed to store email" },
      { status: 500 }
    );
  }
}
