import { join } from 'node:path'
import fs from 'fs-extra'
import type { CheerioAPI } from 'cheerio'
import cheerio from 'cheerio'
import type { Page } from 'puppeteer-core'
import { $URL, withoutTrailingSlash } from 'ufo'
import chalk from 'chalk'
import type { HTMLExtractPayload, PuppeteerTask } from '../../types'
import { useUnlighthouse } from '../../unlighthouse'
import { useLogger } from '../../logger'
import { ReportArtifacts, fetchUrlRaw, formatBytes, trimSlashes } from '../../util'
import { normaliseRoute } from '../../router'
import { setupPage } from '../util'

export const extractHtmlPayload: (page: Page, route: string) => Promise<{ success: boolean; redirected?: false | string; message?: string; payload?: string, axeResults:any }> = async (page, route) => {
  const { worker, resolvedConfig } = useUnlighthouse()

  const logger = useLogger();

  let axeResults = false;

  // if we don't need to execute any javascript we can do a less expensive fetch of the URL
  if (false === true && resolvedConfig.scanner.skipJavascript) {
    const { valid, response, redirected, redirectUrl } = await fetchUrlRaw(route, resolvedConfig)
    if (!valid || !response)
      return { success: false, message: `Invalid response from URL ${route} code: ${response?.status || '404'}.` }

    // ignore non-html
    if (response.headers['content-type'] && !response.headers['content-type'].includes('text/html'))
      return { success: false, message: `Non-HTML Content-Type header: ${response.headers['content-type']}.` }

    return {
      success: true,
      redirected: redirected ? redirectUrl : false,
      payload: response.data,
    }
  }
  // get page html content
  try {
    await page.setCacheEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'other'].includes(request.resourceType()))
        request.abort()
      else
        request.continue()
    })

    await setupPage(page)

    const pageVisit = await page.goto(route, { waitUntil: resolvedConfig.scanner.skipJavascript ? 'domcontentloaded' : 'networkidle0' })
    console.log("____pageVisit:", page.url())
    if (!pageVisit)
      return { success: false, message: `Failed to go to route ${route}.` }

     // Bogdan
    console.log("--------------Bogdan")
    const axeVersion = "4.8.2";

    const puppUrl = page.url();
    console.log("-----Axe for: ", puppUrl)
    const results = await page.evaluate(`
      ( async () => {
      var url = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/${axeVersion}/axe.min.js";
      var script = document.createElement("script");
      script.setAttribute("src", url);
      document.head.appendChild(script);
      const result = new Promise(resolve =>
          script.onload = () => {
          //console.log("axe is loaded.");
          axe.run(document, {iframes:false}).then(results => resolve(results));
          }        
      );
      return (await result);
      })();
    `)

    if(results?.violations){
      console.log("---------------Violations on page:" + puppUrl);
      console.log("Violations from CDN AXE:" + results.violations.length);
      logger.info(`Violations from CDN AXE: ${results.violations.length}`);
      console.log(results.violations)
      axeResults = results;

      fs.writeFileSync('../../axes/' + new Date().getTime() + ".json", JSON.stringify({puppUrl, results}))
    }else{
      logger.info(`NO Violations from CDN AXE: ${puppUrl}`);
      console.log("-----------NO Violations on page:" + puppUrl);
    }

    // only 2xx we'll consider valid
    const { 'content-type': contentType, location } = pageVisit.headers()

    const statusCode = pageVisit.status()
    if ((statusCode === 301 || statusCode === 302) && location) {
      // redirect, failure but we'll queue the other url
      worker.queueRoute(normaliseRoute(location))
      return { success: false, message: `Redirect, queued the new URL: ${location}.` }
    }
    if (statusCode < 200 || statusCode >= 300)
      return { success: false, message: `Invalid status code: ${statusCode}.` }

    // only consider html content types
    if (contentType && !contentType.includes('text/html'))
      return { success: false, message: `Invalid content-type header: ${contentType}.` }

    // handle vite / spa's
    const payload = await (
      resolvedConfig.scanner.skipJavascript
        ? pageVisit.text()
        : page.evaluate(() => document.querySelector('*')?.outerHTML)
    )

    return {
      success: true,
      payload,
      axeResults
    }
  }
  catch (e) {
    return { success: false, message: `Exception thrown when visiting route: ${e}.` }
  }
}

export function processSeoMeta($: CheerioAPI): HTMLExtractPayload {
  return {
    alternativeLangDefault: $('link[hreflang="x-default"]').attr('href'),
    favicon: $('link[rel~="icon"]').attr('href') || '/favicon.ico',
    title: $('meta[name=\'title\'], head > title').text(),
    description: $('meta[name=\'description\']').attr('content'),
    og: {
      image: $('meta[property=\'og:image\'], meta[name=\'og:image\']').attr('content'),
      description: $('meta[property=\'og:description\'], meta[name=\'og:description\']').attr('content'),
      title: $('meta[property=\'og:title\'], meta[name=\'og:title\']').attr('content'),
    },
  }
}

export const inspectHtmlTask: PuppeteerTask = async (props) => {
  const { resolvedConfig, hooks, runtimeSettings } = useUnlighthouse()
  const { page, data: routeReport } = props
  const logger = useLogger()
  let html: string
  let axeResults: any;

  // console.log("inspectHTML BC " + page.url())
  // console.log("-----inspectHTML BC ")
  // console.log(page)

  const start = new Date()
  // basic caching based on saving html payloads
  const htmlPayloadPath = join(routeReport.artifactPath, ReportArtifacts.html)
  let cached = false
  if (false && resolvedConfig.cache && fs.existsSync(htmlPayloadPath)) {
    html = fs.readFileSync(htmlPayloadPath, { encoding: 'utf-8' })
    logger.debug(`Running \`inspectHtmlTask\` for \`${routeReport.route.path}\` using cache.`)
    cached = true
  }
  else {
    const response = await extractHtmlPayload(page, routeReport.route.url)
    console.log("---inspectHtmlTask--")
    console.log("response", response.axeResults)
    logger.debug(`HTML extract of \`${routeReport.route.url}\` response ${response.success ? 'succeeded' : 'failed'}.`)

    if (!response.success || !response.payload) {
      routeReport.tasks.inspectHtmlTask = 'ignore'
      logger.info(`Skipping ${routeReport.route.path}. ${response.message}`)
      return routeReport
    }
    if (response.redirected) {
      // strip any protocols from the url
      const siteHost = runtimeSettings.siteUrl.host.split(':')[0]
      const redirectHost = new $URL(response.redirected).host.split(':')[0]
      // allow subdomains
      if (siteHost !== redirectHost && !redirectHost.endsWith(`.${siteHost}`)) {
        routeReport.tasks.inspectHtmlTask = 'ignore'
        logger.warn(`Redirected URL goes to a different domain, ignoring. \`${response.redirected}\.`)
        return routeReport
      }
      // ignore redirect from site to site/
      if (withoutTrailingSlash(response.redirected) !== runtimeSettings.siteUrl.href)
        logger.info('Redirected url detected, this may cause issues in the final report.', response.redirected)

      // check if redirect url is already queued, if so we bail on this route
    }

    html = response.payload
  }


  // Bogdan
/*
const axeVersion = "4.8.2";
function delayFor(time: Number) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
}
const puppUrl = page.url();
console.log("Axe for: ", puppUrl)
const results = await Promise.race([
  page.evaluate(`
  ( async () => {
  var url = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/${axeVersion}/axe.min.js";
  var script = document.createElement("script");
  script.setAttribute("src", url);
  document.head.appendChild(script);
  const result = new Promise(resolve =>
      script.onload = () => {
      //console.log("axe is loaded.");
      axe.run(document, {iframes:false}).then(results => resolve(results));
      }        
  );
  return (await result);
  })();
`),
delayFor(10000)
]);

if(results?.violations){
  console.log("Violations on page:" + puppUrl);
  console.log("Violations from CDN AXE:" + results.violations.length);
  logger.info(`Violations from CDN AXE: ${results.violations.length}`);
  console.log(results.violations)
  //allAxes.push({url : puppUrl, results});

  //fs.writeFileSync('../../axes/' + new Date().getTime() + ".json", JSON.stringify({puppUrl, results}))
}*/


  const $ = cheerio.load(html)
  routeReport.seo = processSeoMeta($)
  if (resolvedConfig.scanner.ignoreI18nPages && routeReport.seo.alternativeLangDefault && withoutTrailingSlash(routeReport.route.url) !== withoutTrailingSlash(routeReport.seo.alternativeLangDefault)) {
    routeReport.tasks.inspectHtmlTask = 'ignore'
    logger.debug(`Page has an alternative lang, ignoring \`${routeReport.route.path}\`: ${routeReport.seo.alternativeLangDefault}`)
    // make sure we queue the default, this fixes issues with if the home page has a default lang that is alternative
    const unlighthouse = useUnlighthouse()
    unlighthouse.worker.queueRoute(normaliseRoute(routeReport.seo.alternativeLangDefault))
    return routeReport
  }
  const internalLinks: string[] = []
  const externalLinks: string[] = []
  $('a').each(function () {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    const href = $(this).attr('href')
    // href must be provided and not be javascript
    if (!href || href.includes('javascript:') || href.includes('mailto:') || href === '#')
      return

    // if the URL doesn't end with a slash we may be dealing with a file
    if (!href.endsWith('/')) {
      // need to check for a dot, meaning a file
      const parts = href.split('.')
      // 1 part means there is no extension, or no dot in the url
      if (parts.length > 1) {
        // presumably the last part will be the extension
        const extension = trimSlashes(parts[parts.length - 1]).replace('.', '')
        if (extension !== 'html')
          return
      }
    }
    if ((href.startsWith('/') && !href.startsWith('//')) || href.includes(resolvedConfig.site))
      internalLinks.push(href)
    else
      externalLinks.push(href)
  })
  await hooks.callHook('discovered-internal-links', routeReport.route.path, internalLinks)
  routeReport.seo.internalLinks = internalLinks.length
  routeReport.seo.externalLinks = externalLinks.length
  const end = new Date()
  const ms = Math.round(end.getTime() - start.getTime())
  // make ms human friendly
  const seconds = (ms / 1000).toFixed(1)
  if (!cached)
    logger.success(`Completed \`inspectHtmlTask\` for \`${routeReport.route.path}\`. ${chalk.gray(`(${formatBytes(html.length)} took ${seconds}s)`)}`)

  // only need the html payload for caching purposes, unlike the lighthouse reports
  if (resolvedConfig.cache)
    fs.writeFileSync(htmlPayloadPath, html)

  routeReport.axeResults = axeResults;
  return routeReport
}
