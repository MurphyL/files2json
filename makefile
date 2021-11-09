CONTAINER=any2json

vm: 
	docker run --rm -it --name $(CONTAINER) -v $(CURDIR):/usr/murph murphyl/nodejs
