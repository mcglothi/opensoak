package com.opensoak.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.AsyncTask;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class OpenSoakWidget extends AppWidgetProvider {

    private static final String TAG = "OpenSoakWidget";
    private static final String ACTION_REFRESH = "com.opensoak.app.action.REFRESH";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        refreshAllWidgets(context);
    }

    private static void refreshAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName thisAppWidget = new ComponentName(context.getPackageName(), OpenSoakWidget.class.getName());
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisAppWidget);
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.opensoak_widget);

        SimpleDateFormat timeFmt = new SimpleDateFormat("h:mm a", Locale.US);
        SimpleDateFormat dateFmt = new SimpleDateFormat("EEEE, MMM d", Locale.US);
        views.setTextViewText(R.id.widget_time, timeFmt.format(new Date()));
        views.setTextViewText(R.id.widget_date, dateFmt.format(new Date()).toUpperCase());

        Intent intent = new Intent(context, OpenSoakWidget.class);
        intent.setAction(ACTION_REFRESH);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        Intent launchIntent = new Intent(context, MainActivity.class);
        PendingIntent launchPendingIntent = PendingIntent.getActivity(context, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.hot_tub_zone, launchPendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
        new FetchDataTask(context, views, appWidgetId, appWidgetManager).execute();
    }

    private static class FetchDataTask extends AsyncTask<Void, Void, JSONObject> {
        private Context context;
        private RemoteViews views;
        private int widgetId;
        private AppWidgetManager manager;

        FetchDataTask(Context context, RemoteViews views, int widgetId, AppWidgetManager manager) {
            this.context = context;
            this.views = views;
            this.widgetId = widgetId;
            this.manager = manager;
        }

        private String getRawJson(String urlString) throws Exception {
            URL url = new URL(urlString);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        }

        private static String formatTime(String HHmm) {
            try {
                String[] parts = HHmm.split(":");
                int h = Integer.parseInt(parts[0]);
                int m = Integer.parseInt(parts[1]);
                String ampm = h >= 12 ? "PM" : "AM";
                int h12 = h % 12;
                if (h12 == 0) h12 = 12;
                return String.format("%d:%02d %s", h12, m, ampm);
            } catch (Exception e) { return HHmm; }
        }

        @Override
        protected JSONObject doInBackground(Void... voids) {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String host = prefs.getString("opensoak_api_host", "http://opensoak.home.timmcg.net");
            JSONObject result = new JSONObject();
            try { result.put("status", new JSONObject(getRawJson(host + "/api/status/"))); } catch (Exception e) {}
            try { result.put("weather", new JSONObject(getRawJson(host + "/api/status/weather"))); } catch (Exception e) {}
            try { result.put("schedules", new JSONArray(getRawJson(host + "/api/schedules/"))); } catch (Exception e) {}
            return result;
        }

        @Override
        protected void onPostExecute(JSONObject data) {
            try {
                JSONArray scheds = data.optJSONArray("schedules");
                Calendar nowCal = Calendar.getInstance();
                int currentDay = (nowCal.get(Calendar.DAY_OF_WEEK) + 5) % 7; 
                int currentMin = nowCal.get(Calendar.HOUR_OF_DAY) * 60 + nowCal.get(Calendar.MINUTE);

                if (data.has("status")) {
                    JSONObject status = data.getJSONObject("status");
                    JSONObject desired = status.optJSONObject("desired_state");
                    double temp = status.getDouble("current_temp");
                    boolean heater = status.getJSONObject("actual_relay_state").getBoolean("heater");
                    boolean jets = status.getJSONObject("actual_relay_state").getBoolean("jet_pump");
                    boolean light = status.getJSONObject("actual_relay_state").getBoolean("light");

                    views.setTextViewText(R.id.widget_temp, String.format("%.1f", temp));
                    views.setInt(R.id.widget_jets_dot, "setColorFilter", jets ? Color.parseColor("#60a5fa") : Color.parseColor("#33475569"));
                    views.setInt(R.id.widget_light_dot, "setColorFilter", light ? Color.parseColor("#fbbf24") : Color.parseColor("#33475569"));

                    if (desired != null) {
                        boolean manual = desired.optBoolean("manual_soak_active");
                        boolean scheduled = desired.optBoolean("scheduled_session_active");
                        String expiry = manual ? desired.optString("manual_soak_expires") : desired.optString("scheduled_session_expires");

                        if (manual || scheduled) {
                            String name = manual ? "MANUAL SOAK" : "SOAK SESSION";
                            String timeRange = "";

                            if (scheds != null) {
                                for (int i = 0; i < scheds.length(); i++) {
                                    JSONObject s = scheds.getJSONObject(i);
                                    if (!s.optBoolean("active")) continue;
                                    String daysStr = s.optString("days_of_week", "");
                                    if (daysStr.contains(String.valueOf(currentDay))) {
                                        String[] t = s.optString("start_time").split(":");
                                        int sMin = Integer.parseInt(t[0]) * 60 + Integer.parseInt(t[1]);
                                        String[] e = s.optString("end_time").split(":");
                                        int eMin = Integer.parseInt(e[0]) * 60 + Integer.parseInt(e[1]);
                                        if (sMin <= currentMin && eMin > currentMin) {
                                            name = s.optString("name").toUpperCase();
                                            timeRange = formatTime(s.optString("start_time")) + " - " + formatTime(s.optString("end_time"));
                                            break;
                                        }
                                    }
                                }
                            }

                            views.setTextViewText(R.id.widget_active_session, name + " RUNNING");
                            views.setTextViewText(R.id.widget_session_times, timeRange);
                            views.setViewVisibility(R.id.widget_session_times, timeRange.isEmpty() ? View.GONE : View.VISIBLE);
                            views.setViewVisibility(R.id.widget_active_row, View.VISIBLE);
                            
                            if (expiry != null && !expiry.isEmpty() && !expiry.equals("null")) {
                                try {
                                    String clean = expiry.replace("T", " ").split("\\+")[0].split("\\.")[0];
                                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
                                    Date expDate = sdf.parse(clean);
                                    long diffMins = (expDate.getTime() - System.currentTimeMillis()) / 60000;
                                    if (diffMins < 0) {
                                        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                                        expDate = sdf.parse(clean);
                                        diffMins = (expDate.getTime() - System.currentTimeMillis()) / 60000;
                                    }
                                    if (diffMins >= 0) {
                                        views.setTextViewText(R.id.widget_time_left, (diffMins + 1) + "m LEFT");
                                        views.setViewVisibility(R.id.widget_time_left, View.VISIBLE);
                                    } else { views.setViewVisibility(R.id.widget_time_left, View.GONE); }
                                } catch (Exception e) { views.setViewVisibility(R.id.widget_time_left, View.GONE); }
                            }
                        } else {
                            views.setViewVisibility(R.id.widget_active_row, View.GONE);
                        }
                    }
                }

                if (scheds != null) {
                    String nextEventText = "";
                    int minDiff = Integer.MAX_VALUE;
                    for (int i = 0; i < scheds.length(); i++) {
                        JSONObject s = scheds.getJSONObject(i);
                        if (!s.optBoolean("active") || s.optString("type").equals("clean")) continue;
                        String startTime = s.optString("start_time");
                        String daysStr = s.optString("days_of_week");
                        if (startTime.isEmpty() || daysStr.isEmpty()) continue;
                        String[] timeParts = startTime.split(":");
                        int sMin = Integer.parseInt(timeParts[0]) * 60 + Integer.parseInt(timeParts[1]);
                        for (String dStr : daysStr.split(",")) {
                            if (dStr.trim().isEmpty()) continue;
                            int d = Integer.parseInt(dStr.trim());
                            int dayDiff = d - currentDay;
                            if (dayDiff < 0 || (dayDiff == 0 && sMin <= currentMin)) dayDiff += 7;
                            int totalDiff = dayDiff * 1440 + (sMin - currentMin);
                            if (totalDiff < minDiff) {
                                minDiff = totalDiff;
                                nextEventText = s.optString("name").toUpperCase() + " (" + (dayDiff == 0 ? "TODAY" : dayDiff == 1 ? "TOMORROW" : "LATER") + ")";
                            }
                        }
                    }
                    views.setTextViewText(R.id.widget_next_event, nextEventText.isEmpty() ? "NO UPCOMING SCHEDULES" : "NEXT: " + nextEventText);
                }

                if (data.has("weather")) {
                    JSONObject weatherObj = data.getJSONObject("weather");
                    JSONObject cur = weatherObj.optJSONObject("current");
                    if (cur != null) {
                        views.setTextViewText(R.id.widget_weather_temp, String.format("%.0f°", cur.optDouble("temperature_2m", 0)));
                        views.setImageViewResource(R.id.widget_weather_icon, getWeatherIconResource(cur.optInt("weather_code", 0), cur.optInt("is_day", 1) == 1));
                    }
                    JSONObject hourly = weatherObj.optJSONObject("hourly");
                    if (hourly != null) {
                        JSONArray times = hourly.getJSONArray("time");
                        JSONArray codes = hourly.getJSONArray("weather_code");
                        JSONArray temps = hourly.getJSONArray("temperature_2m");
                        int startIndex = 0;
                        LocalDateTime nowLdt = LocalDateTime.now();
                        for (int i = 0; i < times.length(); i++) {
                            LocalDateTime ldt = LocalDateTime.parse(times.getString(i));
                            if (ldt.getHour() == nowLdt.getHour()) { startIndex = i; break; }
                        }
                        int[] timeIds = {R.id.h1_time, R.id.h2_time, R.id.h3_time, R.id.h4_time, R.id.h5_time};
                        int[] iconIds = {R.id.h1_icon, R.id.h2_icon, R.id.h3_icon, R.id.h4_icon, R.id.h5_icon};
                        int[] tempIds = {R.id.h1_temp, R.id.h2_temp, R.id.h3_temp, R.id.h4_temp, R.id.h5_temp};
                        DateTimeFormatter outFmt = DateTimeFormatter.ofPattern("h a", Locale.US);
                        for (int i = 0; i < 5; i++) {
                            int idx = startIndex + i;
                            if (idx >= times.length()) break;
                            LocalDateTime ldt = LocalDateTime.parse(times.getString(idx));
                            views.setTextViewText(timeIds[i], i == 0 ? "NOW" : ldt.format(outFmt).toUpperCase());
                            views.setImageViewResource(iconIds[i], getWeatherIconResource(codes.optInt(idx, 0), ldt.getHour() >= 6 && ldt.getHour() <= 18));
                            views.setTextViewText(tempIds[i], String.format("%.0f°", temps.optDouble(idx, 0)));
                        }
                    }
                }
            } catch (Exception e) { Log.e(TAG, "Update error: " + e.getMessage()); }
            manager.updateAppWidget(widgetId, views);
        }
    }

    private static int getWeatherIconResource(int code, boolean isDay) {
        if (code == 0) return isDay ? R.drawable.ic_weather_sun : R.drawable.ic_weather_moon;
        if (code <= 3) return R.drawable.ic_weather_cloud;
        if (code <= 67) return R.drawable.ic_weather_rain;
        if (code <= 99) return R.drawable.ic_weather_storm;
        return R.drawable.ic_weather_cloud;
    }
}
