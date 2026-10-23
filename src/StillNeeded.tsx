import { B, type Bi } from "./bi";

/* Everything Odelia still needs (src/doNext.ts stillRows), shown on Home in "Do this next" and "Waiting on you", one at a
   time, with Find it for me and Skip on each. Originally: in one list, answered in any order (Stripe Atlas's and Vanta's one checklist instead
   of a form per agency). Every row offers the hand-off first: "Find it for me" asks Odelia to get it herself, from the
   documents already uploaded, connected apps and public records, and to come back only if a person truly has to give
   it (a signature, an ID, a fact only they know). A document can be a photo or a PDF: one tap opens the camera or the
   files. Only what a person has to hand over is listed: the empty lines on a form are Odelia's to fill from the business
   facts and documents, so they never show up here as questions. Nothing here blocks moving on. */

export const findItAsk = (label: Bi, app: Bi, many = false): Bi => B(
  `Find ${many ? "these" : "this"} for the ${app.en}: ${label.en}. Get ${many ? "them" : "it"} yourself from my documents, connected apps and public records, fill ${many ? "them" : "it"} in, and ask me only for what only I can give.`,
  `为${app.zh}找到${many ? "这些" : "这一项"}：${label.zh}。请您自己从我的文件、已连接的应用和公开记录中查找并填好，只有必须由我本人提供的才问我。`);
