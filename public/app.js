import { go } from "./js/navigation.js";
import { attachGlobalActions } from "./js/actions.js";
import { startRouter } from "./js/router.js";

window.go = go;
attachGlobalActions();
startRouter();
