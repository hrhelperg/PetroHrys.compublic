# Business Directories — pending manual verification

Candidates that could not be verified against an official source by automated
fetch. **None of these is published.** They are recorded here so the work is not
lost and so the gap in coverage is visible rather than silent.

Last attempted: 2026-08-04.

| Candidate | Official URL | Suspected category | Suspected scope | Block reason | Priority | Verification steps required |
|---|---|---|---|---|---|---|
| Google Business Profile | https://www.google.com/business/ | local-business | Global | Consent wall (302 to consent.google.com) | **High** | Open in a browser outside the EU consent flow; confirm official name, free listing, review system |
| Chrome Web Store | https://chromewebstore.google.com/ | app-directories | Global | Consent wall | **High** | As above; confirm developer registration fee and review system |
| G2 | https://www.g2.com/ | software | Global | HTTP 403 | **High** | Browser visit; confirm vendor listing route and review verification method |
| npm | https://www.npmjs.com/ | developer | Global | HTTP 403 | **High** | Browser visit; confirm publishing is free and registration requirements |
| Microsoft AppSource | https://appsource.microsoft.com/ | app-directories | Global | HTTP 403 | High | Browser visit; confirm listing prerequisites |
| FINRA BrokerCheck | https://brokercheck.finra.org/ | finance | United States | Insufficient official information (operator and cost not stated on page) | **High** | Confirm FINRA operation and free access from an official FINRA page |
| FCA Financial Services Register | https://register.fca.org.uk/s/ | finance | United Kingdom | JavaScript-only page (returns a loading shell) | **High** | Browser visit; confirm scope of the register and free access |
| NPPES NPI Registry | https://npiregistry.cms.hhs.gov/ | healthcare | United States | JavaScript-only page | High | Browser visit; confirm CMS operation and free access |
| IHK (German chambers) | https://www.ihk.de/ | chambers-of-commerce | Germany | HTTP 403 | High | Browser visit; confirm statutory role and whether a public member directory exists |
| CCI (French chambers) | https://www.cci.fr/ | chambers-of-commerce | France | HTTP 403 | High | As above |
| Unioncamere / Camere di Commercio | https://www.unioncamere.gov.it/sistema-camerale | chambers-of-commerce | Italy | Redirect chain not followed to completion | Medium | Follow redirect; confirm statutory role and registers |
| BaFin | https://www.bafin.de/ | finance | Germany | Insufficient official information (registers not described on the page fetched) | Medium | Locate the specific public register pages and verify each |
| Avvo | https://www.avvo.com/ | legal | United States | Ownership unclear (page names the founder, not the current owner) | Medium | Confirm current corporate ownership from an official source |
| GMC Medical Register | https://www.gmc-uk.org/ | healthcare | United Kingdom | HTTP 403 | Medium | Browser visit; confirm register scope |
| Charity Commission register | https://register-of-charities.charitycommission.gov.uk/ | government | United Kingdom | DNS failure on the subdomain attempted | Medium | Find the current canonical host and re-verify |
| SEC EDGAR | https://www.sec.gov/edgar/ | government | United States | HTTP 403 | **High** | Browser visit; confirm free access and filing scope |
| Kompass | https://www.kompass.com/ | manufacturing | Global | HTTP 403 | Medium | Browser visit; confirm ownership and listing model |
| Thomasnet | https://www.thomasnet.com/ | manufacturing | United States | HTTP 403 | Medium | Browser visit; confirm listing model |
| Yellow Pages | https://www.yellowpages.com/ | local-business | United States | HTTP 403 | Low | Browser visit; confirm ownership and listing model |
| Hotfrog | https://www.hotfrog.com/ | local-business | Global | HTTP 403 | Low | Confirm the platform is actively maintained before considering inclusion |
| Swift Package Index | https://swiftpackageindex.com/ | developer | Global | HTTP 403 | Medium | Browser visit; confirm operator and submission route |
| Terraform Registry | https://registry.terraform.io/ | developer | Global | Insufficient official information (page returned title only) | Medium | Confirm operator and publishing model |
| Artifact Hub | https://artifacthub.io/ | developer | Global | Insufficient official information | Medium | Confirm governing foundation and submission route |
| Free Software Directory | https://directory.fsf.org/ | developer | Global | HTTP 403 | Medium | Browser visit; confirm FSF operation and inclusion policy |
| Black Duck Open Hub | https://openhub.net/ | developer | Global | HTTP 403 | Low | Confirm the platform is still actively maintained |
| Y Combinator Startup Directory | https://www.ycombinator.com/companies | startup | Global | Insufficient official information (title only) | Medium | Confirm whether listing is restricted to portfolio companies |
| Zapier App Directory | https://zapier.com/apps | app-directories | Global | Official name not confirmable | Low | Confirm the directory's official name from Zapier documentation |
| Zoom App Marketplace | https://marketplace.zoom.us/ | app-directories | Global | Insufficient official information | Low | Confirm listing and review model |
| Figma Community | https://www.figma.com/community | app-directories | Global | HTTP 403 | Low | Confirm publishing model |
| Glassdoor | https://www.glassdoor.com/ | review-sites | Global | HTTP 403 | Medium | Confirm employer listing and review verification model |
| StackShare | https://stackshare.io/ | software | Global | HTTP 403 | Low | Confirm the platform is actively maintained |

## Rejected outright, not pending

These were assessed and will not be revisited without new evidence.

| Candidate | Reason |
|---|---|
| openbase.com | Domain no longer resolves. Dead project. |
| CocoaPods | Trunk moving to read-only; not a directory to submit to today. |
| IndiaMART | Scope is national to India, which is not a declared country. Cannot be honestly assigned. |
| Made-in-China.com | Scope is national to China, which is not a declared country. |
| Europages | Pan-European scope with no honest single-country assignment under the current model. |
