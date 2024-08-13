import puppeteer from 'puppeteer'

const user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36"
const credentials = {
  "Administrator": [""] // not used
}

async function match_fingerprint(service, proxy){
  if(service.title.includes('» Device Status')){
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

async function login(service, browser, user, password) {
  let page = await browser.newPage()
  await page.setUserAgent(user_agent)
  await page.setViewport({width: 1000, height: 500})
  await page.goto(`${service.url}/hp/device/SignIn/Index`, {waitUntil:"networkidle0", timeout:30000}).catch((e) => {console.log(e); throw new Error("Couldn't retrieve home page")})
  //await Promise.all([page.waitForNavigation(), page.click("a[href='/hp/device/SignIn/Index']")]).catch(err => {console.log(err); throw new Error("Couldn't retrieve login page")})
  let [response] = await Promise.all([page.waitForNavigation(), page.click("input[id='signInOk']")]).catch(err => {console.log(err); throw new Error("Couldn't click login button")})
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
