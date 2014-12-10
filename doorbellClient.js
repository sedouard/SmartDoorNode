var Gpio = require('onoff').Gpio;
var azure = require('azure');
var Camera = require("camerapi");
var fs = require("fs");
var request = require("request");
var http = require("http");

var cam = new Camera();
var photoQuality = "50";
//totall arbitrary
var deviceID = "325425423"

var doorbellPin = new Gpio(22, 'in', 'both');
var readyLed = new Gpio(4, 'out');

if(process.argv.length > 2){
  photoQuality = process.argv[2];
}

//unexport pins on exit
process.on('SIGINT', exit);

var ready = true;
showReady(1);
console.log("Ready!");
doorbellPin.watch(function(err, value){
  try{

    
    if(value && ready){
      ready = false;
      showReady(ready);

      console.log('taking and sending picture');
      takeAndSendPicture(function(err){
        if(err) {
          return console.log('Error! ' + err);
        }

        console.log("sucessfully took and sent picture");
        ready = true;
        showReady(true);
      });
    }
  }
  catch(e){
    console.error(e);
    ready = true;
    showReady(true);
  }
});

function takeAndSendPicture(callback){


  cam.prepare({timeout: 150,
    width : 2592,
    height: 1944,
    quality: 85
  }).takePicture('me2.jpg', function(file, err){
  
    if(err){
    
      return callback(err);

    }

    console.log('getting sas upload url for mobile service ' + process.env.MobileServiceAPIKey);
    request({ method: "GET", headers: { "X-ZUMO-APPLICATION" : process.env.MobileSerivceAPIKey },
    url:"https://smartdoor.azure-mobile.net/api/photo?doorbellID=" + deviceID },
    function(err, response, body){

    
      if(err){
    
        return callback(err);
      }
      
      var photoResp = JSON.parse(body);
      console.log(body);
      
      console.log("Pushing photo to SAS Url: " + photoResp.sasUrl);

	
      fs.readFile("node_modules/camerapi/pitures/me2.jpg", function(err,data){
        var length = data.length;
        console.log('this file is ' + length + ' long');


        fs.createReadStream("node_modules/camerapi/pitures/me2.jpg").pipe(
          request.put({url: photoResp.sasUrl,
          headers:{"x-ms-blob-type": "BlockBlob", "Content-Length": length}},
          function(error, response, body){
    
            if(error){
      
              return callback(error);
  
            }

            console.log('sucessfully uploaded to cloud ');
	    console.log('status code: ' + response.statusCode );
            console.log(body);
            

            console.log('connection string: ' + process.env.ServiceBusKey);
            var sb = azure.createServiceBusService(process.env.ServiceBusKey);
            sb.sendQueueMessage('arduino', JSON.stringify({ doorBellID: deviceID, imageId : photoResp.photoId }),
            function(err){
            
              if(err){
              
                return callback(err);
              }

              console.log('sucessfully send notification to service bus');

            }); 
            return callback(null);

          })
        );

      });        

    });

    

  });

  
}

function showReady(trueFalse, callback){
  
  if(trueFalse){
    readyLed.writeSync(1);
  }
  else{
    readyLed.writeSync(0);
  }
}

function exit(){

  readyLed.unexport();
  doorbellPin.unexport();
  process.exit();

}