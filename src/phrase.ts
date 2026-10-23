/** A cell's text as one whole phrase: up to the end of its first sentence ("Fax: about 4 business days"), so a table
 *  row stays one line without cutting a sentence off with "…". The full text goes in the cell's title and the sheet. */
export const firstSentence = (s: string) => { const m = /^(.+?[.。])(\s|$)/.exec(s.trim()); return (m ? m[1] : s.trim()).replace(/[.。]$/, ""); };
