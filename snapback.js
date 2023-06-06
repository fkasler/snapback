const puppeteer = require('puppeteer');
const fs = require('fs');
const lineReader = require('line-reader');
const parseString = require('xml2js').parseString;
const md5File = require('md5-file')
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var archiver = require('archiver');
var args = require('minimist')(process.argv.slice(2));
const yaml = require('js-yaml');

var report = './report' // Default

if (args['config']) {
  try {
    const doc = yaml.load(fs.readFileSync(args['config'], 'utf8'));
    report = doc['report_location'];
  }
  catch (err) {
    console.log(err)
  }
}


//set up a report directory if it doesn't exist
try{
  fs.mkdirSync(report)
}catch(err){
  //must exist already. We do it this way to avoid a race condition of checking the existence of the dir before trying to write to it
}

//create a write stream to store scraped emails
email_file = fs.createWriteStream(report + "/emails.txt", {flags:'a'});

// =======================================================
// Connect to/create the database
// =======================================================
const Database = require('better-sqlite3');
//db = new Database('./report/snapback.db', { verbose: console.log });
db = new Database(report + '/snapback.db');

//create the db if it doesn't exist.
let db_setup = db.prepare(`
  CREATE TABLE IF NOT EXISTS services (
    url TEXT NOT NULL UNIQUE,
    image_path TEXT,
    image_hash TEXT,
    text_path TEXT,
    text_hash TEXT,
    text_size INTEGER,
    captured INTEGER,
    error INTEGER,
    viewed INTEGER,
    default_creds TEXT,
    auth_prompt INTEGER,
    notes TEXT
  )`
);

db_setup.run()

//nessus parsing functions
xml_buffer = ''
add_to_buffer = false

function parseReportHost(xml, browser, io){
  parseString(xml, function (err, report_host) {
    let host = report_host.ReportHost.$.name
    let report_items = report_host.ReportHost.ReportItem
    try{
      report_items.forEach(function(item){
        parseReportItem(host, item, browser, io)
      })
    }catch(err){
      //console.log(err)
      //host must not have any findings
    }
  });
}

function parseReportItem(host, item, browser, io){
  let plugin_id = item.$.pluginID
  let service = item.$.svc_name
  let port = item.$.port
  if(((port == '443') || (port == '8443')) || (service.includes("https")) || (service.includes("ssl")) || (service.includes("tls"))){
    push_to_queue("https://" + host + ":" + port, browser, io);
  }else if(plugin_id == '22964'){
    //console.log(item.plugin_output);
    if(item.plugin_output.toString().match(/TLS|SSL/i)){
      push_to_queue("https://" + host + ":" + port, browser, io);
    }else{
      push_to_queue("http://" + host + ":" + port, browser, io);
    }
  }else if((service.includes("www")) || (service.includes("http"))){
    push_to_queue("http://" + host + ":" + port, browser, io);
  //matching Chris Truncer's EyeWitness logic of checking for port 80 on all RDP and VNC hosts
  }//else if((service == "msrdp") || (port == "3389") || (service == "vnc")){
  // push_to_queue("http://" + host + ":80", browser, io);
  //}
}

function parseNmapHost(xml, browser, io){
  parseString(xml, function (err, report_host) {
    addresses = report_host.host.address
    let host = ""
    try{
      Object.keys(addresses).forEach(function(key) {
        if(addresses[key].$.addrtype == "ipv4"){
          host = addresses[key].$.addr
        }
      })
    }catch(err){
      //host must not have any findings
       return
    }
    let report_items = report_host.host.ports
    try{
      Object.keys(report_items).forEach(function(key) {
        parseNmapPort(host, report_items[key], browser, io)
      })
    }catch(err){
      //host must not have any findings
    }
  });
}

function parseNmapPort(host, item, browser, io){
  let services = item.port
  try{
    Object.keys(services).forEach(function(key) {
      if(services[key].state[0].$.state == "open"){
        if(services[key].service[0].$.name.match(/https/ig)){
          push_to_queue("https://" + host + ":" + services[key].$.portid, browser, io);
        }else if(services[key].service[0].$.name.match(/http/ig)){
          push_to_queue("http://" + host + ":" + services[key].$.portid, browser, io);
        }else if(services[key].service[0].$.name.match(/ssl/ig)){
          push_to_queue("https://" + host + ":" + services[key].$.portid, browser, io);
        }
      }
    })
  }catch(err){
    //host must not have any findings
  }
}

function push_to_queue(url, browser, io){
  if(!allServices.includes(url)){
    let stmt = db.prepare(`
      INSERT INTO services VALUES (
        $url,
        $image_path,
        $image_hash,
        $text_path,
        $text_hash,
        $text_size,
        $captured,
        $error,
        $viewed,
        $default_creds,
        $auth_prompt,
        $notes
      )
    `);
    stmt.run({
      "url": url,
      "image_path": '',
      "image_hash": '',
      "text_path": '',
      "text_hash": '',
      "text_size": 0,
      "captured": 0,
      "error": 0,
      "viewed": 0,
      "default_creds": '',
      "auth_prompt": 0,
      "notes": ''
    })
    //if there weren't any errors, then continue pushing to queue
    myQueue.push(url);
    allServices.push(url);
  }
}

//screen cap functions
myQueue = []
allServices = []

var active_threads = 0
const max_threads = 15
scrape_emails = false

async function getPic(browser, page, url, io) {
  try{
    await page.setViewport({width: 1000, height: 500})
    await page.goto(url, {waitUntil: 'load', timeout: 7000});
    let file_name = url.replace(/[\.\/:\?\&=]+/g,"_")
    await wait(delay_setting);
    //Shout out to Sedric Louissaint for the the help on this... He picked the delay at 2100 ¯\_(ツ)_/¯
    await Promise.race([page.screenshot({path: 'report/' + file_name + '.png'}), new Promise((resolve, reject) => setTimeout(reject, 2100))]);
    update_record(url,"image_path",'report/' + file_name + '.png')
    md5File('report/' + file_name + '.png', (err, hash) => {
      if (err) {
        console.log("problem getting image hash for:" + file_name)
      }
      update_record(url,"image_hash",hash)
    })
    bodyHTML = await page.evaluate(() => document.documentElement.innerHTML);
    fs.writeFileSync('report/' + file_name + '.txt', bodyHTML);
    //try to automatically find auth prompts
    if(bodyHTML.match(/type=['"]password['"]/ig)){
      update_record(url,"auth_prompt", 1)
    }
    if(scrape_emails){
      try{
        email_accounts = await page.evaluate('output="";emails = document.documentElement.innerHTML.match(/(([^<>()\\[\\]\\\\.,;:\\s@"]+(\\.[^<>()\\[\\]\\\\.,;:\\s@"]+)*)|(".+"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))/ig);for(i=0;i<emails.length;i++){output += emails[i] + "\\n";};output;');
        email_file.write(email_accounts)
      }catch(err){
        //console.log("problem capturing emails")
      }
    }
    update_record(url,"text_path",'report/' + file_name + '.txt')
    update_record(url,"captured", 1)
    console.log("queue:[" + myQueue.length.toString() + "/" + allServices.length.toString() + "]threads[" + active_threads.toString() + "] captured: " + url)
    io.emit("server_message","queue:[" + myQueue.length.toString() + "/" + allServices.length.toString() + "]threads[" + active_threads.toString() + "] captured: " + url)
    md5File('report/' + file_name + '.txt', (err, hash) => {
      if (err) {
        console.log("problem getting file stats for:" + file_name)
      }
      stats = fs.statSync('report/' + file_name + '.txt');
      update_record(url,"text_size",stats.size)
      //call display here to make sure we have logged the right stats first
      update_record(url,"text_hash",hash,function(){
        display_service(url, io)
      })
    })
    update_record(url,"error", 0) //in case we re-try a host
    active_threads -= 1
    await page.close()
    process_queue(browser, io)
  }catch(err){
    //console.log(err)
    console.log("queue:[" + myQueue.length.toString() + "/" + allServices.length.toString() + "]threads[" + active_threads.toString() + "] problem capturing page: " + url)
    io.emit("server_message","queue:[" + myQueue.length.toString() + "/" + allServices.length.toString() + "]threads[" + active_threads.toString() + "] problem capturing page: " + url)
    update_record(url,"error", 1)
    io.emit('show_error', url)
    await page.close()
    active_threads -= 1
    process_queue(browser, io)
  }
}

async function display_service(url, io){
  let stmt = db.prepare(`SELECT * FROM services WHERE url = $url`);
  let row = stmt.get({"url": url})
  io.emit('add_service', row)
}

async function update_record(url,key,value,callback){
  let stmt = db.prepare(`UPDATE services SET (` + key + `) = ($value) WHERE url = '` + url + `'`);
  stmt.run({"value": value})
  if((typeof callback) != 'undefined'){
    callback()
  }
}

//helper for timeouts
async function wait (timeout) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, timeout)
  })
}

async function process_queue(browser,io){
  if((myQueue.length > 0) & (active_threads < max_threads)){
    let target = myQueue.pop()
    if((target != 'undefined') & (target != '')){
      page = await browser.newPage();
      active_threads += 1
      getPic(browser, page, target, io);
      if(active_threads < max_threads){
        process_queue(browser, io)
      }
    }
  }else if((active_threads == 0) & (allServices.length > 0)){
    await browser.close();
    scrape_emails = false
    io.emit("server_message", "Done!")
  }
}

//process nessus and start running through the queue
async function process_file(request,io) {

  puppet_options = ["--ignore-certificate-errors"]

  scrape_emails = request.scrape_emails

  delay_setting = request.delay_setting

  if(request.use_proxy){
    puppet_options.push("--proxy-server=" + request.proxy_setting)
  }

  if(request.use_no_sandbox){
    puppet_options.push("--no-sandbox")
  }

  const browser = await puppeteer.launch(
    {
      headless: true,
      ignoreHTTPSErrors: true,
      args: puppet_options
    }
  );

  if(request.file_path.match(/nessus$/ig)){
    io.emit('server_message', "processing as Nessus file: "+ request.file_path);
    lineReader.eachLine(request.file_path, function(line) {
      if (line.match(/<ReportHost/i)){
        xml_buffer += line + "\n";
        add_to_buffer = true
      }else if(add_to_buffer){
        xml_buffer += line + "\n";
        if (line.match(/<\/ReportHost/i)){
          parseReportHost(xml_buffer, browser, io)
          xml_buffer = ''
          add_to_buffer = false
        }
      }
    });
    //make sure we have at least a couple in the queue before kicking it off
    await wait(2000)
    process_queue(browser,io)
  }else if(request.file_path.match(/txt$/ig)){
    io.emit('server_message', "processing as flat txt file: "+ request.file_path);
    lineReader.eachLine(request.file_path, function(line) {
      push_to_queue(line, browser, io);
    });
    await wait(1000)
    process_queue(browser,io)
  }else if(request.file_path.match(/js$|json/ig)){
    io.emit('server_message', "processing as ScopeCreep export file: "+ request.file_path);
    full_file = fs.readFileSync(request.file_path, "utf8")
    report_object = JSON.parse(full_file)
    for(i=0; i<report_object.nodes.length; i++){
      let current_node = report_object.nodes[i]
      if(current_node.type == "subdomain"){
        push_to_queue("http://" + current_node.id, browser, io);
        push_to_queue("https://" + current_node.id, browser, io);
      }else if(current_node.type == "port"){
        if(current_node.id.split(":")[1].match(/443/)){
          push_to_queue("https://" + current_node.id, browser, io);
        }else{
          push_to_queue("http://" + current_node.id, browser, io);
        }
      }else if(current_node.type == "network"){
        push_to_queue("http://" + current_node.id, browser, io);
      }else if(current_node.type == "info"){
        if(current_node.id.match(/https?:\/\/.+/)){
          url_regex = new RegExp('(https?://.+)','i')
          url_string = url_regex.exec(current_node.id)[1]
          push_to_queue(url_string, browser, io);
        }
      }
    }
    await wait(1000)
    process_queue(browser,io)
  }else if(request.file_path.match(/xml$/ig)){
    io.emit('server_message', "processing as Nmap file: "+ request.file_path);
    lineReader.eachLine(request.file_path, function(line) {
      if (line.match(/<host /i)){
        xml_buffer += line + "\n";
        add_to_buffer = true
      }else if(add_to_buffer){
        xml_buffer += line + "\n";
        if (line.match(/<\/host>/i)){
          parseNmapHost(xml_buffer, browser, io)
          xml_buffer = ''
          add_to_buffer = false
        }
      }
    });
    await wait(2000)
    process_queue(browser,io)
  }else{
    io.emit('server_message', "Snapback currently only supports .nessus, flat .txt url files, .xml nmap files, and ScopeCreep exports. Try again...");
    await browser.close();
  }
}

//continue with newly generated queue
async function resume_scan(request, io) {
  io.emit('server_message', "processing unfinished queue from DB" );

  scrape_emails = request.scrape_emails

  delay_setting = request.delay_setting

  puppet_options = ["--ignore-certificate-errors"]

  if(request.use_proxy){
    puppet_options.push("--proxy-server=" + request.proxy_setting)
  }

  if(request.use_no_sandbox){
    puppet_options.push("--no-sandbox")
  }

  const browser = await puppeteer.launch(
    {
      headless: true,
      ignoreHTTPSErrors: true,
      args: puppet_options
    }
  );

  process_queue(browser,io)
}


//this function auto-runs and is our Main() for the program
(async function(){

  //if we are giving it a file to parse in the commandline
  if((typeof process.argv[2]) != 'undefined'){
    //if we specify a proxy in the commandline
    if((typeof process.argv[3]) != 'undefined'){
      process_file({"file_path": process.argv[2], "use_proxy": true, "use_no_sandbox": false, "proxy_setting": process.argv[3]}, io)
    }else{
      process_file({"file_path": process.argv[2], "use_proxy": false, "use_no_sandbox": false, "proxy_setting": ""}, io)
    }
  }

  app.get('/', function(req, res){
    res.sendFile(__dirname + '/homepage.html');
  });

  app.get('/favicon.ico', function(req, res){
    res.sendFile(__dirname + '/favicon.ico');
  });

   app.get('/report*', function(req, res){
    res.sendFile(__dirname + req.path);
  });

  app.get('/jquery.min.js', function(req, res){
    res.sendFile(__dirname + '/node_modules/jquery/dist/jquery.min.js');
  });

  app.get('/all_services', function(req, res){
    let stmt = db.prepare("SELECT * FROM services WHERE captured = 1 OR error = 1")
    let all_services = stmt.all()
    res.write(JSON.stringify(all_services))
    res.end()
  });

  app.get('/auth_prompts', function(req, res){
    let stmt = db.prepare("SELECT * FROM services WHERE auth_prompt = 1")
    let all_services = stmt.all()
    res.write(JSON.stringify(all_services))
    res.end()
  });

  app.get('/unviewed_services', function(req, res){
    let stmt = db.prepare("SELECT * FROM services WHERE viewed = 0 AND error = 0")
    let all_services = stmt.all()
    res.write(JSON.stringify(all_services))
    res.end()
  });

  app.get('/notes_services', function(req, res){
    let stmt = db.prepare("SELECT * FROM services WHERE notes != '' OR default_creds != ''")
    let all_services = stmt.all()
    res.write(JSON.stringify(all_services))
    res.end()
  });

  io.on('connection', function(socket){
    socket.on('process_file', function(request){
      process_file(request,io);
    });

    socket.on('update_record', function(request){
      update_record(request.url,request.key,request.value)
    });

    socket.on('pause_scan', function(){
      myQueue = []
    });

    socket.on('resume_scan', function(request){
      let stmt = db.prepare("SELECT * FROM services WHERE captured = 0 AND error = 0").pluck()
      myQueue = stmt.all()
      resume_scan(request, io)
    });

    socket.on('scan_errors', function(request){
      let stmt = db.prepare("SELECT url FROM services WHERE error = 1").pluck()
      myQueue = stmt.all()
      resume_scan(request, io)
    });

    socket.on('csv_export', function(request){

      let fileOutput = fs.createWriteStream('./' + request.csv_name);

      fileOutput.write(`"url","image_path","image_hash","text_path","text_hash","text_size","captured","error","viewed","default_creds","auth_prompt","notes"\n`)
      let stmt = db.prepare("SELECT * FROM services")
      let full_db = stmt.all()
      full_db.forEach(function(row) {
        fileOutput.write(`"${row.url}","${row.image_path}","${row.image_hash}","${row.text_path}","${row.text_hash}","${row.text_size}","${row.captured}","${row.error}","${row.viewed}","${row.default_creds}","${row.auth_prompt}","${row.notes}"\n`)
      });
      fileOutput.close();
    });

    socket.on('report_export', function(request){
      let archive = archiver('zip');

      let fileOutput = fs.createWriteStream('./' + request.zip_name);

      fileOutput.on('close', function () {
        console.log(archive.pointer() + ' total bytes');
        console.log('Report Export saved to: ' + request.zip_name);
      });

      archive.pipe(fileOutput);

      archive.on('error', function(err){
        throw err;
      });

      archive.glob(report + '/snapback.db', false)

      let stmt = db.prepare("SELECT * FROM services WHERE default_creds != '' OR auth_prompt = 1")
      let rows = stmt.all()
      rows.forEach(function(row){
        archive.glob('./' + row.image_path, false)
      });
      archive.finalize();
    });

  });

  http.listen(2997, "0.0.0.0", function(){
    console.log('listening on *:2997');
  });

  //catch any server exceptions instead of exiting
  http.on('error', function (e) {
    console.log("[-]" + " " + e + "\n");
  });

  //catch any node exceptions instead of exiting
  process.on('uncaughtException', function (err) {
    console.log("[-]" + " " + 'Caught exception: ' + err + "\n");
  });
})()
