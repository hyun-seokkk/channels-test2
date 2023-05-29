from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import ChatRooms
from .forms import ChatRoomForm

# Create your views here.
def index(request):
    chatrooms = ChatRooms.objects.order_by('-pk')
    return render(request, "chat/index.html", {'chatrooms': chatrooms})


@login_required
def room(request, room_name):
    return render(request, "chat/room.html", {"room_name": room_name})


@login_required
def create(request):
    if request.method == 'POST':
        form = ChatRoomForm(request.POST)
        if form.is_valid():
            chatroom = form.save(commit=False)
            chatroom.user = request.user
            chatroom.save()
            return redirect('chat:index')
    else:
        form = ChatRoomForm

    return render(request, 'chat/create.html', {'form':form})
    