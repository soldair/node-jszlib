var jszlib = require('../zlib.js'),
test = require('tap').test,
zlib = require('zlib');

test('test can deflate!',function(t){

    var orig = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    jszlib.deflate(orig,function(error,buf){
      if(error) console.log('error ',error);
      t.ok(!error,'should not have error from deflate');

      //var inflate = zlib.createInflate();
      zlib.inflate(buf,function(error,buf){
          if(error) console.log('error: ',error);

          t.ok(!error,'should not have error from inflate');
          t.equals(orig,buf.toString(),'inflated should be the same as deflated');
          t.end();
      });
    });
});
