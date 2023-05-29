from django import forms
from .models import ChatRooms

class ChatRoomForm(forms.ModelForm):
    class Meta:
        model = ChatRooms
        fields = ('title',)