import { dispatch } from "./protocol";
import type { Request } from "./protocol";

self.onmessage = (e: MessageEvent<Request>) => {
  self.postMessage(dispatch(e.data));
};
