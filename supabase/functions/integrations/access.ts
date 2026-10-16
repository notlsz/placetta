// Who may read what a connected account holds (the mailbox, the drive, the books). Kept free of I/O so it can be tested.

/** Reading a connected account: an owner of the workspace, or the member who connected that account themselves.
    Any other member can see that it's connected, but not what's in it. */
export function mayRead(access: string, row: { connected_by?: string | null }, uid: string): boolean {
  if (access === "owner") return true;
  return access === "member" && !!row.connected_by && row.connected_by === uid;
}

export const READ_REFUSED = {
  en: "Only an owner of this workspace, or the person who connected this account, can read what's in it.",
  zh: "只有该工作区的所有者，或连接此账户的人，才能查看其中的内容。",
};
