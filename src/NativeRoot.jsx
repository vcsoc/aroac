import App from "./App";
import { isMobile } from "./platform";
export default function NativeRoot() {
  if (isMobile)
    return (
      <div className="native-onboarding">
        <h2>Mobile local storage is not ready.</h2>
        <p>
          This mobile scaffold is not a release. The standalone local-database
          architecture is currently implemented on desktop only. No remote
          account server will be used as a substitute.
        </p>
      </div>
    );
  return <App />;
}
