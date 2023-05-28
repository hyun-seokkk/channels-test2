import json

from channels.generic.websocket import AsyncWebsocketConsumer


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = "chat_%s" % self.room_name

        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    # Receive message from WebSocket
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        now = text_data_json["now"]

        if now == 'chat':
        # Send message to room group
            message = text_data_json["message"]
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "chat_message", 
                    "message": message
                }
            )
        elif now == 'draw':
            x = text_data_json['x']
            y = text_data_json['y']
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "draw_message", 
                    "x": x,
                    "y": y,
                }
            )
        elif now == 'start':
            x = text_data_json['x']
            y = text_data_json['y']
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "start_message", 
                    "x": x,
                    "y": y,
                }
            )

    # Receive message from room group
    async def chat_message(self, event):
        message = event["message"]

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": message,
            "now": 'chat',
            })
        )
    
    async def draw_message(self, event):
        x = event['x']
        y = event['y']
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            'now': 'draw',
        }))


    async def start_message(self, event):
        x = event['x']
        y = event['y']
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            'now': 'start',
        }))