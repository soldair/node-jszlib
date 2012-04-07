[![Build Status](https://secure.travis-ci.org/soldair/node-jszlib.png)](http://travis-ci.org/soldair/node-jszlib)

## jszlib

This provides an all js version of deflate. The goal is to provide a similar api to node's built in zlib. This provides a sync deflate that node native does not. Contributions welcome! 

## Example

```js

var jszlib = require('jszlib'),
watcher = jszlib.deflate('aaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbb',function(error,buffer){
  console.log(Buffer.toString('base64'));
});

```
 
## install

	npm install jszlib

### argument structure

jszlib.deflate(buffer, [options], callback)

jszlib.deflateSync(buffer, [options]);

- buffer
  - this can be a String or node Buffer object. 

- options. 
  - right now no options need to be passed in from the outside.

- callback
  - for non sync the buffer is passed as the data argument to the callback.

	```js
	callback(error,buffer)
	```
# thanks

most of the code is by imaya https://github.com/imaya/CanvasTool.PngEncoder who wrote a cool js png encoder. Thanks!! 
I ported this to node requires and updated the interface to be more nodey.

