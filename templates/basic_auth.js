/*
Author: YOUR_NAME_HERE
Org: ORG_NAME_HERE
Contributors: YOUR_SHOUTOUTS_HERE
*/
import got from 'got'
import SocksProxyAgent from 'socks-proxy-agent'

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

async function bruteforce(service, proxy){
  for(var user in credentials) {
    for(var pwd of credentials[user]){
      let options = {
        "throwHttpErrors": false,
        "https": {rejectUnauthorized: false},
        "username": user,
        "password": pwd
      }
      if(proxy != ''){
        var proxy_agent = new SocksProxyAgent(proxy) 
        options.agent = {
          http: proxy_agent,
          https: proxy_agent
        }
      }
      //modify the URL below
      let response = await got(`${service.url}/manager/html`, options).catch(function(err){
        console.log(`Failed Attempt: ${user}:${pwd}`); console.log(err)
      })
      //modify the success check below
      if(response && response.statusCode == 200){
        return `${user}:${pwd}`
      }
    }
  }
  return false
}

export {match_fingerprint, bruteforce}
