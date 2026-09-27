"use server";
import { requestCardLink } from "@/lib/card_resend";

export async function requestCardLinkAction(formData: FormData) {
  const contact = String(formData.get("contact") ?? "");
  const { message } = await requestCardLink(contact);
  return { message };
}
