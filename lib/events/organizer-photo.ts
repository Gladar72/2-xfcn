/** An event cover never substitutes for the organizer's profile photo. */
export function hasOrganizerPhoto(avatarUrl: unknown): avatarUrl is string {
  return typeof avatarUrl === "string" && avatarUrl.trim().length > 0;
}

export const ORGANIZER_PHOTO_MESSAGE = "Чтобы создать открытую встречу, добавь своё фото в профиль. Так люди увидят, кто их приглашает.";
