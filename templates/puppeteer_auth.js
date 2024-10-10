/*
Author: YOUR_NAME_HERE
Org: ORG_NAME_HERE
Contributors: YOUR_SHOUTOUTS_HERE
*/
import puppeteer from 'puppeteer'

const user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36"

//fill out with the default creds
//array of passwords for dictionary("hash") of usernames. Fun fact, username can in fact be "" (blank)
const credentials = {
  "user": ["", "password1", "password2"],
  "admin": ["", "Password1", "password2", "password3"]
}

async function match_fingerprint(service, proxy){
  let title_match = service.title.includes("TITLE")
  let header_match = service.headers.includes(HEADERS)
  let meta_match = service.meta_tags.includes(METATAGS)
  //Only fall back on this next check if there isn't an obvious way to do it with title, headers, and metadata. Delete if not needed
  let data = await fs.promises.readFile(`./${service.text_path}`, 'utf8')
  let data_match = data.includes('some search string on the HTML page')
  //Mix and match requirements below. Often you just need one. Delete the unnecessary stuff.
  if(title_match && header_match && meta_match && data_match){
    return service.title
  }else{
    return false
  }
}

async function create_browser(proxy) {
  let puppet_options = ["--ignore-certificate-errors"]
  if(proxy){
    puppet_options.push("--proxy-server=" + proxy)
  }
  if(process.getuid() == 0){
    puppet_options.push("--no-sandbox")
  }
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: puppet_options
  })
  return browser
}

//modify the logic below to drive the headless browser page to log in and check for success
async function login(service, browser, user, password) {
  let page = await browser.newPage()
  await page.setUserAgent(user_agent)
  await page.setViewport({width: 1000, height: 500})
  await page.goto(`${service.url}/hp/device/SignIn/Index`, {
    waitUntil:"networkidle0",
    timeout:30000
  }).catch((e) => {console.log(e); throw new Error("Couldn't retrieve home page")})
  let [response] = await Promise.all([
    page.waitForNavigation(),
    page.click("input[id='signInOk']")
  ]).catch(err => {console.log(err); throw new Error("Couldn't click login button")})
  if (response.status() === 200) {
    await browser.close()
    return true
  }
  return false
}

async function bruteforce(service, proxy){
  let browser = await create_browser(proxy)
  for(var user in credentials) {
    for(var pwd of credentials[user]) {
      try {
        if (await login(service, browser, user, pwd)){return `${user}:${pwd}`}
      } catch (err) {}
    }
 }
 return false
}

export {match_fingerprint, bruteforce}
