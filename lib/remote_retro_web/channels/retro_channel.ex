defmodule RemoteRetroWeb.RetroChannel do
  use RemoteRetroWeb, :channel

  alias RemoteRetroWeb.{Presence, PresenceUtils}
  alias RemoteRetro.{Idea, Emails, Mailer, Retro, Vote}

  import ShorterMaps

  def join("retro:" <> retro_id, _, socket) do
    socket = assign(socket, :retro_id, retro_id)
    retro = Repo.get!(Retro, retro_id) |> Repo.preload([:ideas, :votes, :users])

    send self(), :after_join
    {:ok, retro, socket}
  end

  def handle_info(:after_join, socket) do
    PresenceUtils.track_timestamped(socket)
    push socket, "presence_state", Presence.list(socket)
    {:noreply, socket}
  end

  def handle_in("enable_edit_state", ~m{idea, editorToken}, socket) do
    broadcast! socket, "enable_edit_state", %{
      "id" => idea["id"],
      "editorToken" => editorToken
    }
    {:noreply, socket}
  end

  def handle_in("disable_edit_state", ~m{id}, socket) do
    broadcast! socket, "disable_edit_state", ~m{id}
    {:noreply, socket}
  end

  def handle_in("user_typing_idea", ~m{userToken}, socket) do
    broadcast! socket, "user_typing_idea", ~m{userToken}
    {:noreply, socket}
  end

  def handle_in("idea_live_edit", ~m{id, liveEditText}, socket) do
    broadcast! socket, "idea_live_edit", ~m{id, liveEditText}
    {:noreply, socket}
  end

  def handle_in("highlight_idea", ~m{id, isHighlighted}, socket) do
    broadcast! socket, "idea_highlighted", ~m{id, isHighlighted}
    {:noreply, socket}
  end

  def handle_in("new_idea", props, socket) do
    idea = add_idea! props, socket

    broadcast! socket, "new_idea_received", idea
    {:noreply, socket}
  end

  def handle_in("idea_edited", ~m{id, body, category, assigneeId}, socket) do
    idea =
      Repo.get(Idea, id)
      |> Idea.changeset(~M{body, category, assignee_id: assigneeId})
      |> Repo.update!

    broadcast! socket, "idea_edited", idea
    {:noreply, socket}
  end

  def handle_in("delete_idea", id, socket) do
    idea = Repo.delete!(%Idea{id: id})

    broadcast! socket, "idea_deleted", idea
    {:noreply, socket}
  end

  def handle_in("submit_vote", %{"ideaId" => idea_id, "userId" => user_id}, socket) do
    retro_id = socket.assigns.retro_id
    query = from votes in Vote,
              join: ideas in Idea,
              where: votes.idea_id == ideas.id
              and ideas.retro_id == ^retro_id
              and votes.user_id == ^user_id

    user_vote_count = Repo.aggregate(query, :count, :id)

    if user_vote_count < 3 do
      broadcast! socket, "vote_submitted", ~m{idea_id, user_id}

      %Vote{
        idea_id: idea_id,
        user_id: user_id
      }
      |> Vote.changeset
      |> Repo.insert!
    end

    {:noreply, socket}
  end

  def handle_in("proceed_to_next_stage", %{"stage" => "closed"}, socket) do
    retro_id = socket.assigns.retro_id
    update_retro!(retro_id, "closed")
    Emails.action_items_email(retro_id) |> Mailer.deliver_now

    broadcast! socket, "proceed_to_next_stage", %{"stage" => "closed"}
    {:noreply, socket}
  end

  def handle_in("proceed_to_next_stage", ~m{stage}, socket) do
    update_retro!(socket.assigns.retro_id, stage)

    broadcast! socket, "proceed_to_next_stage", ~m{stage}
    {:noreply, socket}
  end

  def handle_in(unhandled_message, payload, socket) do
    error_payload = %{unhandled_message: %{type: unhandled_message, payload: payload}}
    Honeybadger.notify(error_payload, %{retro_id: socket.assigns.retro_id})

    {:reply, {:error, error_payload}, socket}
  end

  defp add_idea!(~m{body, category, userId, assigneeId}, socket) do
    %Idea{
      body: body,
      category: category,
      retro_id: socket.assigns.retro_id,
      user_id: userId,
      assignee_id: assigneeId
    }
    |> Idea.changeset
    |> Repo.insert!
  end

  defp update_retro!(retro_id, stage) do
    Repo.get(Retro, retro_id)
    |> Retro.changeset(~m{stage})
    |> Repo.update!
  end
end
