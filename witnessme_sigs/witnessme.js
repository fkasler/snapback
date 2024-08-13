import fs from 'fs'
import YAML from 'yaml'
import glob from 'glob'

var all_sigs = []

glob('./*.yaml', function (er, files) {
  for (var i=0; i<files.length; i++) {
    let sig_file = files[i]
    let sig = YAML.parse(fs.readFileSync(sig_file, 'utf8'))
    all_sigs.push(sig)
  }   
})

glob('../report/*.txt', function (er, files) {
  for (var i=0; i<files.length; i++) {
    let html_file = files[i]
    fs.readFile(html_file, function(err,data){
      if (err) throw err;
      for(const sig of all_sigs){
        for(const signature of sig.signatures){
          if(data.includes(signature)){
            console.log(`Witnessme Service Detection:${sig.name}:${html_file}:matches --> ${signature}:${JSON.stringify(sig.credentials)}`)
          }
        }
      }
    })  
  }   
})


