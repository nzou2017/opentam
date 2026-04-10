(()=>{var e={};e.id=7656,e.ids=[7656],e.modules={47849:e=>{"use strict";e.exports=require("next/dist/client/components/action-async-storage.external")},72934:e=>{"use strict";e.exports=require("next/dist/client/components/action-async-storage.external.js")},55403:e=>{"use strict";e.exports=require("next/dist/client/components/request-async-storage.external")},54580:e=>{"use strict";e.exports=require("next/dist/client/components/request-async-storage.external.js")},94749:e=>{"use strict";e.exports=require("next/dist/client/components/static-generation-async-storage.external")},45869:e=>{"use strict";e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},85729:(e,t,r)=>{"use strict";r.r(t),r.d(t,{GlobalError:()=>n.ZP,__next_app__:()=>x,originalPathname:()=>c,pages:()=>l,routeModule:()=>p,tree:()=>d}),r(94344),r(26923),r(98652),r(37242);var s=r(92318),a=r(4707),n=r(32233),i=r(73414),o={};for(let e in i)0>["default","tree","pages","GlobalError","originalPathname","__next_app__","routeModule"].indexOf(e)&&(o[e]=()=>i[e]);r.d(t,o);let d=["",{children:["install",{children:["__PAGE__",{},{page:[()=>Promise.resolve().then(r.bind(r,94344)),"/Users/nzou/projects/Q/packages/dashboard/src/app/install/page.tsx"]}]},{}]},{layout:[()=>Promise.resolve().then(r.bind(r,26923)),"/Users/nzou/projects/Q/packages/dashboard/src/app/layout.tsx"],error:[()=>Promise.resolve().then(r.bind(r,98652)),"/Users/nzou/projects/Q/packages/dashboard/src/app/error.tsx"],"not-found":[()=>Promise.resolve().then(r.bind(r,37242)),"/Users/nzou/projects/Q/packages/dashboard/src/app/not-found.tsx"]}],l=["/Users/nzou/projects/Q/packages/dashboard/src/app/install/page.tsx"],c="/install/page",x={require:r,loadChunk:()=>Promise.resolve()},p=new s.AppPageRouteModule({definition:{kind:a.x.APP_PAGE,page:"/install/page",pathname:"/install",bundlePath:"",filename:"",appPaths:[]},userland:{loaderTree:d}})},79368:(e,t,r)=>{Promise.resolve().then(r.bind(r,41975))},41975:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>i});var s=r(41077),a=r(97683),n=r(70147);function i(){let{sdkKey:e,backendUrl:t}=n.backendConfig,[r,i]=(0,a.useState)("web"),o=`<script src="https://cdn.useq.dev/q.min.js"></script>
<script>
  Q.init("${e}");
</script>`,d=`curl -X POST ${t}/api/v1/events \\
  -H "Content-Type: application/json" \\
  -d '{
    "tenantId": "tenant-1",
    "sessionId": "test-session",
    "currentUrl": "/dashboard",
    "signals": {
      "rageClicks": 3,
      "deadEndLoops": 1,
      "dwellSeconds": 45,
      "cursorEntropy": 0.8
    },
    "domSnapshot": "<button id=\\"create-project-btn\\">Create Project</button>",
    "timestamp": "${new Date().toISOString()}"
  }'`,l=`// Package.swift dependency
.package(url: "https://github.com/nicholasgousis/q-sdk-ios.git", from: "1.0.0")

// 1. Initialize (AppDelegate or @main App)
import QSDK

Q.initialize(sdkKey: "${e}", options: QOptions(
    backendUrl: "${t}"
))

// 2. Track screens (call in each view's onAppear)
Q.trackScreen("Home", route: "home")

// 3. Send chat from your own UI (async)
let response = try await Q.chat("How do I reset my password?")
print(response.reply)

// 4. Handle interventions (optional)
if let intervention = response.intervention {
    await Q.executeIntervention(intervention)
}

// 5. Register a route handler for deep link interventions (optional)
Q.registerRouteHandler { route in
    // Navigate to the given screen route
}`,c=`// build.gradle.kts (app module)
dependencies {
    implementation("dev.useq:q-sdk-android:1.0.0")
}

// 1. Initialize (Application.onCreate)
import dev.useq.sdk.Q
import dev.useq.sdk.QOptions

Q.initialize(
    context = this,
    sdkKey = "${e}",
    options = QOptions(backendUrl = "${t}")
)

// 2. Track screens (call in onResume or Compose LaunchedEffect)
Q.trackScreen("Home", route = "home")

// 3. Send chat from your own UI (on background thread)
val response = Q.chat("How do I reset my password?")
showReply(response.reply)

// 4. Handle interventions (optional)
response.intervention?.let { Q.executeIntervention(it) }

// 5. Register a route handler for deep link interventions (optional)
Q.registerRouteHandler { route ->
    // Navigate to the given destination
}`,x=e=>`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${r===e?"bg-white dark:bg-gray-900 text-amber-600 border-b-2 border-amber-500":"text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`;return(0,s.jsxs)("div",{className:"p-8 max-w-3xl",children:[s.jsx("h1",{className:"mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100",children:"Install"}),(0,s.jsxs)("div",{className:"mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-700",children:[s.jsx("button",{onClick:()=>i("web"),className:x("web"),children:"Web"}),s.jsx("button",{onClick:()=>i("ios"),className:x("ios"),children:"iOS"}),s.jsx("button",{onClick:()=>i("android"),className:x("android"),children:"Android"})]}),"web"===r&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("section",{className:"mb-8",children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"1. Add the Q snippet to your site"}),(0,s.jsxs)("p",{className:"mb-3 text-sm text-gray-600 dark:text-gray-400",children:["Paste this into the ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs",children:"<head>"})," of every page where you want Q to run."]}),s.jsx("pre",{className:"overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-green-300 shadow-inner whitespace-pre-wrap",children:o}),(0,s.jsxs)("p",{className:"mt-2 text-xs text-gray-400 dark:text-gray-500",children:["SDK key: ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5",children:e})]})]}),(0,s.jsxs)("section",{className:"mb-8",children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"2. Test your installation"}),s.jsx("p",{className:"mb-3 text-sm text-gray-600 dark:text-gray-400",children:"Run this curl command to send a test frustration event and verify the backend responds with an intervention."}),s.jsx("pre",{className:"overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-blue-300 shadow-inner whitespace-pre-wrap",children:d})]}),(0,s.jsxs)("section",{children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"3. Verify"}),(0,s.jsxs)("p",{className:"text-sm text-gray-600 dark:text-gray-400",children:["After sending the test event, visit the"," ",s.jsx("a",{href:"/","aria-label":"Navigate to Overview",className:"text-amber-600 underline hover:text-amber-700",children:"Overview"})," ","page to see the intervention logged in real time."]})]})]}),"ios"===r&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("section",{className:"mb-8",children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"1. Add the Q SDK via Swift Package Manager"}),(0,s.jsxs)("p",{className:"mb-3 text-sm text-gray-600 dark:text-gray-400",children:["In Xcode, go to ",s.jsx("strong",{children:"File > Add Package Dependencies"})," and enter the repository URL. Q is a headless SDK — initialize it, then call ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs",children:"Q.chat()"})," from your own chat UI."]}),s.jsx("pre",{className:"overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-green-300 shadow-inner whitespace-pre-wrap",children:l}),(0,s.jsxs)("p",{className:"mt-2 text-xs text-gray-400 dark:text-gray-500",children:["SDK key: ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5",children:e})]})]}),(0,s.jsxs)("section",{className:"mb-8",children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"2. Set accessibility identifiers"}),(0,s.jsxs)("p",{className:"text-sm text-gray-600 dark:text-gray-400",children:["Q uses accessibility identifiers to locate UI elements. Add ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs",children:'.accessibilityIdentifier("my-button")'})," to key views, then register them in the Functional Map with platform set to ",s.jsx("strong",{children:"iOS"}),"."]})]}),(0,s.jsxs)("section",{children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"3. Verify"}),(0,s.jsxs)("p",{className:"text-sm text-gray-600 dark:text-gray-400",children:["Open the chat bubble in your app and ask a question. Check the"," ",s.jsx("a",{href:"/","aria-label":"Navigate to Overview",className:"text-amber-600 underline hover:text-amber-700",children:"Overview"})," ","page to see telemetry events arriving from your iOS app."]})]})]}),"android"===r&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("section",{className:"mb-8",children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"1. Add the Q SDK via Gradle"}),(0,s.jsxs)("p",{className:"mb-3 text-sm text-gray-600 dark:text-gray-400",children:["Add the dependency to your app module. Q is a headless SDK — initialize it, then call ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs",children:"Q.chat()"})," from your own chat UI."]}),s.jsx("pre",{className:"overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-green-300 shadow-inner whitespace-pre-wrap",children:c}),(0,s.jsxs)("p",{className:"mt-2 text-xs text-gray-400 dark:text-gray-500",children:["SDK key: ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5",children:e})]})]}),(0,s.jsxs)("section",{className:"mb-8",children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"2. Set content descriptions and view IDs"}),(0,s.jsxs)("p",{className:"text-sm text-gray-600 dark:text-gray-400",children:["Q uses ",s.jsx("code",{className:"rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs",children:"contentDescription"})," and view IDs to locate UI elements. Add them to key views, then register them in the Functional Map with platform set to ",s.jsx("strong",{children:"Android"}),"."]})]}),(0,s.jsxs)("section",{children:[s.jsx("h2",{className:"mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200",children:"3. Verify"}),(0,s.jsxs)("p",{className:"text-sm text-gray-600 dark:text-gray-400",children:["Open the chat bubble in your app and ask a question. Check the"," ",s.jsx("a",{href:"/","aria-label":"Navigate to Overview",className:"text-amber-600 underline hover:text-amber-700",children:"Overview"})," ","page to see telemetry events arriving from your Android app."]})]})]})]})}},70147:(e,t,r)=>{"use strict";r.d(t,{backendConfig:()=>s});let s={backendUrl:"http://localhost:3001",secretKey:"sk_test_acme",sdkKey:"sdk_test_acme",tenantName:process.env.NEXT_PUBLIC_TENANT_NAME??process.env.Q_TENANT_NAME??""}},94344:(e,t,r)=>{"use strict";r.r(t),r.d(t,{$$typeof:()=>i,__esModule:()=>n,default:()=>o});var s=r(69620);let a=(0,s.createProxy)(String.raw`/Users/nzou/projects/Q/packages/dashboard/src/app/install/page.tsx`),{__esModule:n,$$typeof:i}=a;a.default;let o=(0,s.createProxy)(String.raw`/Users/nzou/projects/Q/packages/dashboard/src/app/install/page.tsx#default`)}};var t=require("../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[2808,1556,3555],()=>r(85729));module.exports=s})();