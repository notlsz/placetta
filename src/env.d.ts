/** True only in a local development build (vite.config.ts): the app may then load the whole agent into the browser
 *  (src/localAgent.ts). False in every production build, so that code is dropped from what ships. */
declare const __LOCAL_AGENT__: boolean;
